/**
 * iFood pelo módulo LOGISTICS — o Leeva é a plataforma de logística da loja.
 *
 *   1. eventos   pollIfoodLogisticsEvents (≥ 30 s, excludeHeartbeat) → ack de TODOS
 *      - pedido novo  → GET /logistics/orders/{id} → vira entrega no Leeva (fila)
 *      - DDCR         → orders.ifood_code_required = true (o iFood quer o código)
 *      - cancelado    → cancela no Leeva
 *      - concluído    → fecha no Leeva
 *   2. etapas    conforme a entrega anda no Leeva, avisa o iFood NA ORDEM:
 *      motoboy definido → assignDriver + goingToOrigin
 *      retirou          → arrivedAtOrigin
 *      saiu pra entrega → dispatch
 *      chegou/entregou  → arrivedAtDestination (+ verifyDeliveryCode)
 *      A última etapa avisada fica em orders.ifood_logistics_step; 409 do iFood
 *      ("já feita / fora de ordem") conta como feita pra não travar a fila.
 *   3. código    o motoboy digita no app o código que o cliente passa; o Leeva
 *      confere no iFood (verifyDeliveryCode) antes de fechar a entrega.
 *
 * Tudo que sai pro iFood fica registrado em integration_events (direction
 * 'outbound') — é o log que o analista confere na homologação.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';
import {
  IfoodApiError,
  pollIfoodLogisticsEvents,
  ackIfoodLogisticsEvents,
  getIfoodLogisticsOrder,
  sendIfoodLogisticsStep,
  verifyIfoodDeliveryCode,
  IFOOD_LOGISTICS_STEPS,
  IFOOD_LOGISTICS_EVENT,
  type IfoodLogisticsStep,
  type IfoodVehicle,
} from '../integrations/ifood-client';
import { logisticsOrderToNormalized } from '../integrations/ifood';
import { getValidIfoodAccessToken, IfoodNotLinkedError } from './ifood-link';
import { createOrderFromNormalized } from './orders';
import { resolveAndApplyDeliveryLocation, deliveryLocationErrorMessage } from './address';
import { isValidLatLng } from './geo';
import { closeIfoodOrder } from './ifood-sync';

type DB = SupabaseClient<Database>;
type Json = Database['public']['Tables']['integration_events']['Insert']['payload'];

/** Etapa máxima que o status do Leeva já permite avisar. */
function targetStep(status: string): IfoodLogisticsStep | null {
  if (status === 'assigned') return 'goingToOrigin';
  if (status === 'picked_up') return 'arrivedAtOrigin';
  if (status === 'in_route') return 'dispatch';
  return null;
}

function vehicleOf(v: string | null | undefined): IfoodVehicle {
  const s = (v ?? '').toLowerCase();
  if (/carro|car/.test(s)) return 'CAR';
  if (/bike|bicic/.test(s)) return 'BICYCLE';
  return 'MOTORCYCLE';
}

async function logOutbound(
  db: DB,
  restaurantId: string,
  orderId: string | null,
  action: string,
  status: number,
  body: unknown,
) {
  await db
    .from('integration_events')
    .insert({
      restaurant_id: restaurantId,
      provider: 'ifood',
      direction: 'outbound',
      event_id: `out:${orderId ?? '-'}:${action}:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
      signature_valid: true,
      status: status >= 200 && status < 300 ? 'processed' : status === 409 ? 'ignored' : 'failed',
      order_id: orderId,
      payload: { action, httpStatus: status, response: body ?? null } as unknown as Json,
      processed_at: new Date().toISOString(),
      error: status >= 400 && status !== 409 ? `HTTP ${status}` : null,
    })
    .then(() => undefined, () => undefined);
}

/** Roda com o token do restaurante; se o iFood disser 401, renova na hora e tenta 1x de novo. */
async function withToken<T>(db: DB, restaurantId: string, fn: (token: string) => Promise<T>): Promise<T> {
  const { token } = await getValidIfoodAccessToken(db, restaurantId);
  try {
    return await fn(token);
  } catch (e) {
    if (e instanceof IfoodApiError && e.status === 401) {
      const fresh = await getValidIfoodAccessToken(db, restaurantId, { force: true });
      return fn(fresh.token);
    }
    throw e;
  }
}

export type IfoodLogisticsSyncResult = {
  ok: boolean;
  polled: number;
  imported: number;
  stepsSent: number;
  errors: string[];
};

/**
 * Busca o pedido no iFood e cria a entrega no Leeva (se ainda não existe).
 * Pedido do iFood NÃO pode ser recusado por endereço — a entrega existe: se o
 * mapa não achar (ou vier 0,0), entra sem o ponto e com aviso nas observações.
 * Devolve o id da entrega criada (null se já existia).
 */
async function importIfoodOrder(db: DB, restaurantId: string, ifoodOrderId: string, autoCall: boolean): Promise<string | null> {
  const { data: have } = await db
    .from('orders')
    .select('id')
    .eq('restaurant_id', restaurantId)
    .eq('source', 'ifood')
    .eq('external_id', ifoodOrderId)
    .maybeSingle();
  if (have) return null;
  const raw = await withToken(db, restaurantId, (t) => getIfoodLogisticsOrder(t, ifoodOrderId));
  const parsed = logisticsOrderToNormalized(raw);
  if (!parsed.ok) throw new Error(parsed.error);
  const a = parsed.order.address;
  if (a.latitude === 0 && a.longitude === 0) {
    a.latitude = null;
    a.longitude = null;
  }
  const hasCoords = isValidLatLng(a.latitude, a.longitude);
  const loc = await resolveAndApplyDeliveryLocation(db, restaurantId, parsed.order, { confirmed: hasCoords });
  if (!loc.ok) {
    a.latitude = null;
    a.longitude = null;
    parsed.order.notes = [`⚠ Endereço não localizado no mapa (${deliveryLocationErrorMessage(loc.reason)}) — confira com o cliente`, parsed.order.notes]
      .filter(Boolean)
      .join(' · ');
  }
  const created = await createOrderFromNormalized(db, restaurantId, parsed.order, { holdForReview: !autoCall, allowNoLocation: true });
  if (!created.ok) throw new Error(created.error);
  return created.duplicate ? null : created.orderId;
}

/** Um ciclo completo pra UM restaurante vinculado: eventos + etapas pendentes. */
export async function syncIfoodLogistics(db: DB, restaurantId: string): Promise<IfoodLogisticsSyncResult> {
  const out: IfoodLogisticsSyncResult = { ok: true, polled: 0, imported: 0, stepsSent: 0, errors: [] };
  let merchantIds: string[] = [];
  try {
    merchantIds = (await getValidIfoodAccessToken(db, restaurantId)).merchantIds;
  } catch (e) {
    return { ...out, ok: false, errors: [e instanceof IfoodNotLinkedError ? e.message : (e as Error).message] };
  }

  const { data: rst } = await db.from('restaurants').select('logistics_config').eq('id', restaurantId).maybeSingle();
  const autoCall = (rst?.logistics_config as { ifood_auto_call?: boolean } | null)?.ifood_auto_call ?? true;

  // 1. eventos
  try {
    const events = await withToken(db, restaurantId, (t) => pollIfoodLogisticsEvents(t, merchantIds));
    out.polled = events.length;
    for (const evt of events) {
      try {
        const { error: dup } = await db.from('integration_events').insert({
          restaurant_id: restaurantId,
          provider: 'ifood',
          direction: 'inbound',
          event_id: evt.id,
          signature_valid: true,
          status: 'received',
          payload: evt as unknown as Json,
        });
        if (dup) {
          if (dup.code !== '23505') {
            out.errors.push(`evento ${evt.id}: ${dup.message}`);
            continue;
          }
          // já visto: só reprocessa se da outra vez falhou (deduplicação)
          const { data: prev } = await db.from('integration_events').select('status').eq('provider', 'ifood').eq('event_id', evt.id).maybeSingle();
          if (prev?.status !== 'failed') continue;
        }
        if (!evt.orderId) continue;

        if (IFOOD_LOGISTICS_EVENT.isCodeRequested(evt)) {
          await db.from('orders').update({ ifood_code_required: true }).eq('restaurant_id', restaurantId).eq('source', 'ifood').eq('external_id', evt.orderId);
        } else if (IFOOD_LOGISTICS_EVENT.isCancelled(evt) || IFOOD_LOGISTICS_EVENT.isConcluded(evt)) {
          await closeIfoodOrder(db, restaurantId, evt.orderId, IFOOD_LOGISTICS_EVENT.isCancelled(evt) ? 'cancelled' : 'concluded');
        } else {
          // qualquer outro evento de um pedido que ainda não temos = pedido novo
          const createdId = await importIfoodOrder(db, restaurantId, evt.orderId, autoCall);
          if (createdId) {
            await db.from('integration_events').update({ order_id: createdId }).eq('provider', 'ifood').eq('event_id', evt.id);
            out.imported++;
          }
        }
        await db
          .from('integration_events')
          .update({ status: 'processed', processed_at: new Date().toISOString() })
          .eq('provider', 'ifood')
          .eq('event_id', evt.id);
      } catch (e) {
        out.errors.push(`evento ${evt.id}: ${(e as Error).message}`);
        await db.from('integration_events').update({ status: 'failed', error: (e as Error).message.slice(0, 300) }).eq('provider', 'ifood').eq('event_id', evt.id);
      }
    }
    // confirma TODOS os eventos buscados (inclusive os que falharam aqui — o
    // pedido é buscado de novo pelo id na próxima tentativa, abaixo)
    if (events.length) await withToken(db, restaurantId, (t) => ackIfoodLogisticsEvents(t, events.map((e) => e.id)));
  } catch (e) {
    out.errors.push(`eventos: ${(e as Error).message}`);
  }

  // 1b. pedido novo que falhou nas últimas 6 h (já confirmado ao iFood, então
  //     não volta no polling): tenta importar de novo pelo id, no máx. 5 por ciclo
  try {
    const { data: failed } = await db
      .from('integration_events')
      .select('event_id, payload')
      .eq('restaurant_id', restaurantId)
      .eq('provider', 'ifood')
      .eq('direction', 'inbound')
      .eq('status', 'failed')
      .gte('created_at', new Date(Date.now() - 6 * 3600_000).toISOString())
      .limit(5);
    for (const f of failed ?? []) {
      const evt = f.payload as unknown as { orderId?: string; code: string; fullCode?: string; id: string };
      if (!evt?.orderId || IFOOD_LOGISTICS_EVENT.isCancelled(evt) || IFOOD_LOGISTICS_EVENT.isConcluded(evt) || IFOOD_LOGISTICS_EVENT.isCodeRequested(evt)) continue;
      // o iFood já cancelou/concluiu esse pedido? então não traz de volta
      const { data: closed } = await db
        .from('integration_events')
        .select('id')
        .eq('provider', 'ifood')
        .eq('restaurant_id', restaurantId)
        .in('payload->>code', ['CAN', 'CON'])
        .eq('payload->>orderId', evt.orderId)
        .limit(1);
      if (closed?.length) {
        await db.from('integration_events').update({ status: 'ignored', error: 'pedido já cancelado/concluído no iFood' }).eq('provider', 'ifood').eq('event_id', f.event_id ?? '');
        continue;
      }
      try {
        const r = await importIfoodOrder(db, restaurantId, evt.orderId, autoCall);
        if (r) out.imported++;
        await db.from('integration_events').update({ status: 'processed', error: null, processed_at: new Date().toISOString(), order_id: r }).eq('provider', 'ifood').eq('event_id', f.event_id ?? '');
      } catch (e) {
        await db.from('integration_events').update({ error: `(nova tentativa) ${(e as Error).message}`.slice(0, 300) }).eq('provider', 'ifood').eq('event_id', f.event_id ?? '');
      }
    }
  } catch {
    /* nova tentativa nunca derruba o ciclo */
  }

  // 2. etapas pendentes
  try {
    out.stepsSent = await pushIfoodLogisticsSteps(db, restaurantId);
  } catch (e) {
    out.errors.push(`etapas: ${(e as Error).message}`);
  }

  out.ok = out.errors.length === 0;
  return out;
}

/**
 * Avisa ao iFood as etapas que o Leeva já passou e o iFood ainda não sabe,
 * na ordem obrigatória. `onlyOrderId` restringe a um pedido (usado na hora de
 * fechar a entrega). Devolve quantas etapas saíram.
 */
export async function pushIfoodLogisticsSteps(
  db: DB,
  restaurantId: string,
  onlyOrderId?: string,
  upTo?: IfoodLogisticsStep,
): Promise<number> {
  let q = db
    .from('orders')
    .select('id, external_id, status, motoboy_id, ifood_logistics_step, dispatch_hold')
    .eq('restaurant_id', restaurantId)
    .eq('source', 'ifood')
    .in('status', ['assigned', 'picked_up', 'in_route'])
    .not('external_id', 'is', null)
    .limit(50);
  if (onlyOrderId) q = q.eq('id', onlyOrderId);
  const { data: orders } = await q;
  let sent = 0;

  for (const o of orders ?? []) {
    if (o.dispatch_hold || !o.motoboy_id) continue;
    const target = upTo ?? targetStep(o.status);
    if (!target) continue;
    const doneIdx = o.ifood_logistics_step ? IFOOD_LOGISTICS_STEPS.indexOf(o.ifood_logistics_step as IfoodLogisticsStep) : -1;
    const targetIdx = IFOOD_LOGISTICS_STEPS.indexOf(target);
    if (doneIdx >= targetIdx) continue;

    let driver: { name: string; phone: string; vehicle: IfoodVehicle } | undefined;
    if (doneIdx < 0) {
      const { data: m } = await db.from('motoboys').select('full_name, phone, vehicle').eq('id', o.motoboy_id).maybeSingle();
      driver = { name: m?.full_name ?? 'Entregador', phone: m?.phone ?? '', vehicle: vehicleOf(m?.vehicle) };
    }

    for (let i = doneIdx + 1; i <= targetIdx; i++) {
      const step = IFOOD_LOGISTICS_STEPS[i]!;
      const r = await withToken(db, restaurantId, async (t) => {
        const res = await sendIfoodLogisticsStep(t, o.external_id!, step, step === 'assignDriver' ? driver : undefined);
        if (res.status === 401) throw new IfoodApiError('token expirado', 401, res.body);
        return res;
      });
      await logOutbound(db, restaurantId, o.id, step, r.status, r.body);
      // 2xx = aceito; 409 = já feito/fora de ordem → segue (não trava a entrega)
      if ((r.status >= 200 && r.status < 300) || r.status === 409) {
        await db.from('orders').update({ ifood_logistics_step: step }).eq('id', o.id);
        sent++;
        continue;
      }
      break; // erro real: tenta de novo no próximo ciclo
    }
  }
  return sent;
}

/** Restaurante tem o iFood vinculado (então o pedido do iFood segue o fluxo Logistics)? */
export async function isIfoodLogisticsLinked(db: DB, restaurantId: string): Promise<boolean> {
  const { data } = await db
    .from('integrations')
    .select('config')
    .eq('restaurant_id', restaurantId)
    .eq('provider', 'ifood')
    .maybeSingle();
  return (data?.config as { linkStatus?: string } | null)?.linkStatus === 'linked';
}

/**
 * Na hora de fechar a entrega de um pedido do iFood: garante as etapas até
 * arrivedAtDestination e confere o código do cliente no iFood.
 *  - código certo (ou o iFood não pediu código) → ok
 *  - código errado (422/400)                    → bloqueia, motoboy digita de novo
 */
export async function confirmIfoodLogisticsDelivery(
  db: DB,
  restaurantId: string,
  orderId: string,
  code: string | null | undefined,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: o } = await db
    .from('orders')
    .select('external_id, ifood_code_required')
    .eq('id', orderId)
    .maybeSingle();
  if (!o?.external_id) return { ok: false, error: 'pedido do iFood sem referência' };

  try {
    await pushIfoodLogisticsSteps(db, restaurantId, orderId, 'arrivedAtDestination');
  } catch (e) {
    return { ok: false, error: `Não consegui avisar o iFood agora (${(e as Error).message}). Tente de novo.` };
  }

  const given = (code ?? '').replace(/\D/g, '');
  if (!given) {
    if (o.ifood_code_required) return { ok: false, error: 'Peça ao cliente o código de entrega do iFood e digite aqui.' };
    return { ok: true };
  }

  const r = await withToken(db, restaurantId, async (t) => {
    const res = await verifyIfoodDeliveryCode(t, o.external_id!, given);
    if (res.status === 401) throw new IfoodApiError('token expirado', 401, res.body);
    return res;
  });
  await logOutbound(db, restaurantId, orderId, 'verifyDeliveryCode', r.status, r.body);
  if (r.status >= 200 && r.status < 300 && r.success) return { ok: true };
  if (r.status === 422 || r.status === 400 || (r.status < 300 && !r.success)) {
    return { ok: false, error: 'Código de entrega incorreto. Peça o código de novo pro cliente.' };
  }
  // 404/412: o iFood não pede código pra este pedido (não veio o DDCR)
  if ((r.status === 404 || r.status === 412) && !o.ifood_code_required) return { ok: true };
  return { ok: false, error: `O iFood não confirmou o código agora (HTTP ${r.status}). Tente de novo em instantes.` };
}

/** Ciclo pra todos os restaurantes com iFood vinculado (chamado pelo cron de 30 s). */
export async function syncAllIfoodLogistics(db: DB): Promise<{ restaurants: number; imported: number; stepsSent: number; errors: number }> {
  const { data } = await db.from('integrations').select('restaurant_id, config').eq('provider', 'ifood');
  const linked = (data ?? []).filter((r) => (r.config as { linkStatus?: string } | null)?.linkStatus === 'linked');
  let imported = 0;
  let stepsSent = 0;
  let errors = 0;
  for (const r of linked) {
    const res = await syncIfoodLogistics(db, r.restaurant_id);
    imported += res.imported;
    stepsSent += res.stepsSent;
    errors += res.errors.length;
  }
  return { restaurants: linked.length, imported, stepsSent, errors };
}

