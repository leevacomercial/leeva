/**
 * Rastreamento público do cliente.
 *
 * Segurança:
 *  - o link usa um token aleatório (24 bytes hex) — impossível adivinhar;
 *  - o token pode expirar (expires_at) e ser revogado (revoked);
 *  - a rota /track usa o cliente admin (service_role) SÓ para buscar pelo
 *    token e montar um snapshot enxuto — nunca expõe id interno, telefone
 *    de motoboy, valores de custo, outros pedidos, nem dados de outra org;
 *  - isolamento entre organizações é natural: o token aponta para 1 pedido
 *    de 1 restaurante.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';
import { randomToken } from '../lib/crypto';
import { ORDER_STATUS_LABELS } from '../constants';
import { estimateOrderEta } from './eta';

type DB = SupabaseClient<Database>;

/** Base pública do app do restaurante (onde vive /track/:token). */
export function trackingBaseUrl(): string {
  return (
    process.env.LEEVA_TRACKING_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'https://leeva-restaurante-six.vercel.app'
  ).replace(/\/$/, '');
}

/** URL completa de rastreamento para um token. */
export function trackingUrl(token: string): string {
  return `${trackingBaseUrl()}/track/${token}`;
}

export async function ensureTrackingToken(db: DB, orderId: string): Promise<string | null> {
  const { data: existing } = await db
    .from('tracking_tokens')
    .select('token, revoked, expires_at')
    .eq('order_id', orderId)
    .eq('revoked', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return existing.token;

  const { data: order } = await db.from('orders').select('restaurant_id').eq('id', orderId).maybeSingle();
  if (!order) return null;
  const token = randomToken(24);
  const { error } = await db.from('tracking_tokens').insert({
    restaurant_id: order.restaurant_id,
    order_id: orderId,
    token,
    expires_at: new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString(),
  });
  if (error) {
    // corrida: outra requisição criou o token ao mesmo tempo — reaproveita
    const { data: raced } = await db
      .from('tracking_tokens')
      .select('token')
      .eq('order_id', orderId)
      .eq('revoked', false)
      .limit(1)
      .maybeSingle();
    return raced?.token ?? null;
  }
  return token;
}

export type PublicTrackingSnapshot = {
  restaurantName: string;
  orderNumber: number | null;
  status: Database['public']['Enums']['order_status'];
  statusLabel: string;
  cancelled: boolean;
  delivered: boolean;
  steps: { key: string; label: string; done: boolean; current: boolean }[];
  etaText: string | null;
  createdAt: string;
  deliveredAt: string | null;
  driver: { name: string; position: { latitude: number; longitude: number } | null } | null;
  destination: { latitude: number; longitude: number } | null;
  origin: { latitude: number; longitude: number } | null;
  updatedAt: string;
};

const STEP_DEFS: { key: string; label: string; statuses: string[] }[] = [
  { key: 'received', label: 'Pedido recebido', statuses: ['waiting_dispatch'] },
  { key: 'preparing', label: 'Em preparo', statuses: ['preparing'] },
  { key: 'ready', label: 'Pronto', statuses: ['ready'] },
  { key: 'on_the_way', label: 'Motoboy a caminho', statuses: ['assigned', 'picked_up'] },
  { key: 'in_route', label: 'Em entrega', statuses: ['in_route'] },
  { key: 'delivered', label: 'Entregue', statuses: ['delivered'] },
];

const ORDER_RANK: Record<string, number> = {
  waiting_dispatch: 0,
  preparing: 1,
  ready: 2,
  assigned: 3,
  picked_up: 4,
  in_route: 5,
  delivered: 6,
  cancelled: 99,
};

export async function getPublicTrackingSnapshot(
  db: DB,
  token: string,
): Promise<{ ok: true; snapshot: PublicTrackingSnapshot } | { ok: false; error: string; code: number }> {
  const { data: tok } = await db
    .from('tracking_tokens')
    .select('id, order_id, restaurant_id, revoked, expires_at')
    .eq('token', token)
    .maybeSingle();

  if (!tok) return { ok: false, error: 'Link inválido', code: 404 };
  if (tok.revoked) return { ok: false, error: 'Link desativado', code: 410 };
  if (tok.expires_at && new Date(tok.expires_at) < new Date())
    return { ok: false, error: 'Link expirado', code: 410 };

  const { data: order } = await db
    .from('orders')
    .select('id, order_number, status, created_at, delivered_at, latitude, longitude, motoboy_id, eta_min, eta_max, eta_computed_at, restaurant_id')
    .eq('id', tok.order_id)
    .maybeSingle();
  if (!order) return { ok: false, error: 'Pedido não encontrado', code: 404 };

  const { data: restaurant } = await db
    .from('restaurants')
    .select('name, latitude, longitude')
    .eq('id', order.restaurant_id)
    .maybeSingle();

  let driver: PublicTrackingSnapshot['driver'] = null;
  if (order.motoboy_id && ['assigned', 'picked_up', 'in_route'].includes(order.status)) {
    const { data: m } = await db
      .from('motoboys')
      .select('full_name, current_latitude, current_longitude, location_updated_at')
      .eq('id', order.motoboy_id)
      .maybeSingle();
    if (m) {
      const fresh =
        m.location_updated_at && Date.now() - new Date(m.location_updated_at).getTime() < 5 * 60000;
      driver = {
        name: (m.full_name ?? 'Entregador').split(' ')[0] ?? 'Entregador',
        position:
          fresh && m.current_latitude != null && m.current_longitude != null
            ? { latitude: m.current_latitude, longitude: m.current_longitude }
            : null,
      };
    }
  }

  // registra a visualização (sem bloquear a resposta)
  void db
    .from('tracking_tokens')
    .update({ last_viewed_at: new Date().toISOString() })
    .eq('id', tok.id)
    .then(() => {});

  const cancelled = order.status === 'cancelled';
  const delivered = order.status === 'delivered';
  const rank = ORDER_RANK[order.status] ?? 0;
  const steps = STEP_DEFS.map((s) => {
    const stepRank = Math.min(...s.statuses.map((st) => ORDER_RANK[st] ?? 0));
    return {
      key: s.key,
      label: s.label,
      done: cancelled ? false : delivered ? true : rank > stepRank,
      current: s.statuses.includes(order.status),
    };
  });

  // ETA ao vivo para pedidos em andamento (o valor gravado pode estar velho)
  let etaText: string | null = null;
  if (!cancelled && !delivered) {
    let eta = null as Awaited<ReturnType<typeof estimateOrderEta>>;
    try {
      eta = await estimateOrderEta(db, order.id);
    } catch {
      /* ignora — sem ETA */
    }
    if (eta) {
      etaText = `Chega em aproximadamente ${eta.minMinutes}–${eta.maxMinutes} minutos`;
    } else if (order.eta_min != null && order.eta_max != null && order.eta_computed_at) {
      const ageMin = (Date.now() - new Date(order.eta_computed_at).getTime()) / 60_000;
      if (ageMin < 20) etaText = `Chega em aproximadamente ${order.eta_min}–${order.eta_max} minutos`;
    }
  }

  return {
    ok: true,
    snapshot: {
      restaurantName: restaurant?.name ?? 'Restaurante',
      orderNumber: order.order_number,
      status: order.status,
      statusLabel: ORDER_STATUS_LABELS[order.status],
      cancelled,
      delivered,
      steps,
      etaText,
      createdAt: order.created_at,
      deliveredAt: order.delivered_at,
      driver,
      destination:
        order.latitude != null && order.longitude != null
          ? { latitude: order.latitude, longitude: order.longitude }
          : null,
      origin:
        restaurant?.latitude != null && restaurant?.longitude != null
          ? { latitude: restaurant.latitude, longitude: restaurant.longitude }
          : null,
      updatedAt: new Date().toISOString(),
    },
  };
}
