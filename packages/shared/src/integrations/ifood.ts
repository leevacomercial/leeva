/**
 * IFoodOrderProvider — PREPARADO.
 *
 * IMPORTANTE: o iFood não manda webhook pro parceiro. O RECEBIMENTO de
 * pedido de verdade é feito por polling, por RESTAURANTE (cada um vincula
 * sua própria conta iFood via authorization_code + userCode — o Leeva é um
 * "app distribuído", não usa client_credentials) — ver `ifood-client.ts` +
 * `services/ifood-link.ts` (vínculo) + `services/ifood-sync.ts` (polling).
 * `verifyWebhook` aqui só existe porque a rota genérica
 * `/api/webhooks/[provider]` aceita 'ifood' — não é o caminho usado.
 *
 * O que já está pronto:
 *  - parsing do payload de pedido do iFood (formato da API de Pedidos v1)
 *    para NormalizedOrder.
 *
 * `pushStatus` (confirmar/despachar/concluir) ainda não tem chamador em
 * lugar nenhum do sistema (dead code intencional — não é regressão). Pra
 * ligar de verdade precisa de um `restaurantId` (o token agora é por
 * restaurante, via `getValidIfoodAccessToken`), que a interface
 * `OrderProvider.pushStatus(externalId, status)` não carrega — ajustar
 * quando alguém for de fato chamar isso a partir de `advanceOrderStatus`.
 */
import type { OrderProvider, ProviderResult, NormalizedOrder } from './types';
import { hmacSha256Hex, timingSafeEqualHex } from '../lib/crypto';

type IFoodOrderPayload = {
  id?: string;
  displayId?: string;
  customer?: { name?: string; phone?: { number?: string } };
  items?: { name?: string; quantity?: number; price?: number; unitPrice?: number; observations?: string }[];
  total?: { orderAmount?: number; deliveryFee?: number; subTotal?: number };
  delivery?: {
    deliveryAddress?: {
      formattedAddress?: string;
      coordinates?: { latitude?: number; longitude?: number };
      neighborhood?: string;
    };
  };
  createdAt?: string;
  observations?: string;
};

export class IFoodOrderProvider implements OrderProvider {
  readonly source = 'ifood' as const;
  readonly integrationStatus = 'prepared' as const;

  get configured() {
    return Boolean(process.env.IFOOD_CLIENT_ID && process.env.IFOOD_CLIENT_SECRET);
  }

  async verifyWebhook(req: { headers: Record<string, string>; rawBody: string }): Promise<boolean> {
    const secret = process.env.IFOOD_WEBHOOK_SECRET;
    if (!secret) return false; // PREPARADO: sem segredo, não confiamos em nada
    const sig = req.headers['x-ifood-signature'] || req.headers['x-signature'] || '';
    if (!sig) return false;
    const expected = await hmacSha256Hex(secret, req.rawBody);
    return timingSafeEqualHex(expected, sig);
  }

  async parse(payload: unknown): Promise<ProviderResult> {
    const p = payload as IFoodOrderPayload;
    if (!p || (!p.id && !p.displayId)) return { ok: false, error: 'Payload iFood sem id do pedido' };

    const items = (p.items ?? []).map((i) => ({
      name: i.name ?? 'Item',
      quantity: i.quantity ?? 1,
      unitPrice: i.unitPrice ?? i.price ?? 0,
      notes: i.observations,
    }));
    const addr = p.delivery?.deliveryAddress;

    const order: NormalizedOrder = {
      externalId: p.id ?? p.displayId ?? null,
      source: 'ifood',
      eventId: p.id ?? null,
      customer: {
        name: p.customer?.name ?? 'Cliente iFood',
        phone: p.customer?.phone?.number ?? null,
      },
      items,
      address: {
        formatted: addr?.formattedAddress ?? 'Endereço não informado',
        latitude: addr?.coordinates?.latitude ?? null,
        longitude: addr?.coordinates?.longitude ?? null,
        region: addr?.neighborhood ?? null,
      },
      total: p.total?.subTotal ?? p.total?.orderAmount ?? items.reduce((s, i) => s + i.quantity * i.unitPrice, 0),
      deliveryFee: p.total?.deliveryFee ?? 0,
      notes: p.observations ?? null,
      createdAt: p.createdAt,
      raw: payload,
    };
    return { ok: true, order };
  }

  /**
   * PREPARADO, sem chamador ainda. `OrderProvider.pushStatus` não recebe
   * `restaurantId` e o token do iFood agora é por restaurante — quando isto
   * for ligado em `advanceOrderStatus`, passe o token já resolvido
   * (`getValidIfoodAccessToken(db, restaurantId)`) em vez de reautenticar
   * aqui dentro.
   */
  async pushStatus(): Promise<{ ok: boolean; error?: string }> {
    return { ok: false, error: 'iFood pushStatus: ainda não ligado (precisa do restaurantId — ver comentário no código)' };
  }
}

/**
 * Pedido do módulo LOGISTICS (GET /logistics/v1.0/orders/{id}) → formato do
 * Leeva. O valor que o motoboy recebe do cliente é `payments.pending`
 * (o resto já foi pago no iFood). O localizador vem em customer.phone.localizer.
 */
export function logisticsOrderToNormalized(raw: Record<string, unknown>): ProviderResult {
  type Money = { value?: number; method?: string; type?: string; card?: { brand?: string } };
  const p = raw as {
    id?: string;
    displayId?: string;
    createdAt?: string;
    customer?: { name?: string; phone?: { number?: string; localizer?: string } };
    items?: { name?: string; quantity?: number; unitPrice?: number; observations?: string }[];
    payments?: { prepaid?: number; pending?: number; methods?: Money[] };
    delivery?: {
      observations?: string;
      deliveryAddress?: {
        formattedAddress?: string;
        streetName?: string;
        streetNumber?: string;
        complement?: string;
        reference?: string;
        neighborhood?: string;
        city?: string;
        state?: string;
        postalCode?: string;
        coordinates?: { latitude?: number; longitude?: number };
      };
    };
  };
  if (!p?.id) return { ok: false, error: 'pedido de logística do iFood sem id' };
  const a = p.delivery?.deliveryAddress ?? {};
  const line =
    a.formattedAddress?.trim() ||
    [[a.streetName, a.streetNumber].filter(Boolean).join(', '), a.neighborhood, a.city, a.state].filter(Boolean).join(', ');
  const pending = Number(p.payments?.pending ?? 0);
  const method = (p.payments?.methods?.find((m) => m.method)?.method ?? '').toUpperCase();
  const paymentMethod: NormalizedOrder['paymentMethod'] =
    pending <= 0 ? 'online' : method === 'CASH' ? 'cash' : method === 'PIX' ? 'pix' : /CREDIT|DEBIT|MEAL|FOOD|CARD/.test(method) ? 'card_on_delivery' : 'other';
  const localizer = p.customer?.phone?.localizer?.replace(/\D/g, '') || null;
  const notes = [
    p.displayId ? `iFood #${p.displayId}` : null,
    a.complement ? `Compl.: ${a.complement}` : null,
    a.reference ? `Ref.: ${a.reference}` : null,
    p.delivery?.observations,
  ]
    .filter(Boolean)
    .join(' · ');
  return {
    ok: true,
    order: {
      externalId: p.id,
      source: 'ifood',
      ifoodLocator: localizer,
      eventId: p.id,
      customer: { name: p.customer?.name ?? 'Cliente iFood', phone: p.customer?.phone?.number ?? null },
      items: (p.items ?? [])
        .filter((i) => i.name)
        .map((i) => ({ name: i.name!, quantity: i.quantity ?? 1, unitPrice: i.unitPrice ?? 0, notes: i.observations })),
      address: {
        formatted: line || 'Endereço não informado',
        latitude: a.coordinates?.latitude ?? null,
        longitude: a.coordinates?.longitude ?? null,
        region: a.neighborhood ?? null,
      },
      total: pending > 0 ? pending : 0,
      deliveryFee: 0,
      paymentMethod,
      paymentStatus: pending > 0 ? 'pending' : 'paid',
      notes: notes || null,
      createdAt: p.createdAt,
      raw,
    },
  };
}
