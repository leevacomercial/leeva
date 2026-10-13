import { getApiContext, adminDb } from '@/lib/context';
import { json, unauthorized, forbidden, serverError } from '@/lib/api';
import { DEFAULT_LOGISTICS_CONFIG, getPayoutPolicy } from '@leeva/shared/services';
import { sanitizeBusinessHours } from '@leeva/shared/services/business-hours';
import type { LogisticsConfig, PayoutConfig } from '@leeva/shared';
import type { Database } from '@leeva/shared/types';

const num = (v: unknown, min: number, max: number, dflt: number) => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : dflt;
  return Math.min(max, Math.max(min, n));
};

export async function GET() {
  const ctx = await getApiContext();
  if (!ctx) return unauthorized();
  try {
    const db = adminDb();
    const { data: rst } = await db
      .from('restaurants')
      .select('fleet_mode, logistics_config, latitude, longitude, address, name')
      .eq('id', ctx.restaurantId)
      .maybeSingle();
    const payout = await getPayoutPolicy(db, ctx.restaurantId);
    return json({
      fleetMode: 'own' as const,
      name: rst?.name,
      address: rst?.address,
      latitude: rst?.latitude,
      longitude: rst?.longitude,
      logistics: { ...DEFAULT_LOGISTICS_CONFIG, ...((rst?.logistics_config as object) ?? {}) },
      payout,
    });
  } catch (e) {
    return serverError(e);
  }
}

/**
 * Rede Leeva: taxas e remuneração (taxa do cliente, pedido mínimo, frete
 * grátis, per_km/mínimo do motoboy) NÃO são editáveis pelo restaurante —
 * só o admin da plataforma mexe nisso (apps/admin/restaurantes/[id]).
 *
 * Frota própria (modelo mensal): o motoboy é do estabelecimento e quem paga
 * é ele — então ELE define a taxa do cliente, o tempo prometido e quanto
 * paga ao motoboy (body.payout → payout_policies do restaurante).
 */
export async function POST(req: Request) {
  const ctx = await getApiContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== 'restaurant_owner') return forbidden('Apenas o dono pode alterar a configuração.');
  try {
    const body = (await req.json().catch(() => ({}))) as {
      latitude?: number;
      longitude?: number;
      logistics?: Partial<LogisticsConfig>;
      businessHours?: unknown;
      whatsapp?: string | null;
      payout?: Partial<PayoutConfig>;
    };
    const db = adminDb();

    const { data: current } = await db
      .from('restaurants')
      .select('logistics_config, fleet_mode')
      .eq('id', ctx.restaurantId)
      .maybeSingle();
    const existing: LogisticsConfig = { ...DEFAULT_LOGISTICS_CONFIG, ...((current?.logistics_config as object) ?? {}) };

    const L = body.logistics ?? {};
    const logistics: LogisticsConfig = {
      ...existing,
      // definidos só pelo admin — nunca aceitos daqui, mesmo se vierem no body
      customer_fee: existing.customer_fee,
      min_order: existing.min_order,
      free_delivery_min_order: existing.free_delivery_min_order,
      max_dispatch_attempts: existing.max_dispatch_attempts,
      service_radius_km: num(L.service_radius_km, 1, 50, existing.service_radius_km),
      grouping_enabled: L.grouping_enabled ?? existing.grouping_enabled,
      auto_dispatch_enabled: L.auto_dispatch_enabled ?? existing.auto_dispatch_enabled,
      ifood_auto_call: L.ifood_auto_call ?? existing.ifood_auto_call,
      offer_timeout_seconds: num(L.offer_timeout_seconds, 15, 300, existing.offer_timeout_seconds),
      default_prep_minutes: num(L.default_prep_minutes, 1, 120, existing.default_prep_minutes),
      dispatch_lead_minutes: num(L.dispatch_lead_minutes, 0, 60, existing.dispatch_lead_minutes),
    };

    // frota própria: o estabelecimento define as próprias taxas
    {
      logistics.customer_fee = num(L.customer_fee, 0, 200, existing.customer_fee);
      logistics.customer_fee_included_km = num(L.customer_fee_included_km, 0, 50, existing.customer_fee_included_km ?? 3);
      logistics.customer_fee_per_extra_km = num(L.customer_fee_per_extra_km, 0, 50, existing.customer_fee_per_extra_km ?? 0);
      if (Array.isArray(L.customer_fee_by_region)) {
        const seen = new Set<string>();
        logistics.customer_fee_by_region = (L.customer_fee_by_region as unknown[])
          .map((e) => e as { region?: unknown; fee?: unknown; driver_pay?: unknown })
          .map((e) => ({
            region: String(e.region ?? '').trim().slice(0, 60),
            fee: num(e.fee, 0, 500, 0),
            // vazio = o motoboy recebe pela regra por km
            driver_pay: e.driver_pay === null || e.driver_pay === undefined || e.driver_pay === '' ? null : num(e.driver_pay, 0, 500, 0),
          }))
          .filter((e) => {
            const k = e.region.toLowerCase();
            if (!e.region || seen.has(k)) return false;
            seen.add(k);
            return true;
          })
          .slice(0, 300);
      }
      logistics.delivery_promise_minutes = num(L.delivery_promise_minutes, 10, 240, existing.delivery_promise_minutes ?? 50);
      logistics.free_delivery_min_order =
        L.free_delivery_min_order === null
          ? null
          : typeof L.free_delivery_min_order === 'number' && L.free_delivery_min_order > 0
            ? num(L.free_delivery_min_order, 1, 100000, 0)
            : existing.free_delivery_min_order;

      if (body.payout) {
        const P = body.payout;
        const cur = await getPayoutPolicy(db, ctx.restaurantId);
        const perKm = num(P.per_km, 0, 50, cur.per_km);
        const merged: PayoutConfig = {
          ...cur,
          per_km: perKm,
          per_km_grouped: perKm, // na frota própria parada extra paga igual
          min_payout: num(P.min_payout, 0, 500, cur.min_payout),
          group_max_stops: Math.round(num(P.group_max_stops, 1, 8, cur.group_max_stops ?? 3)),
          group_radius_km: num(P.group_radius_km, 0.3, 10, cur.group_radius_km ?? 1.5),
        };
        const { data: pol } = await db
          .from('payout_policies')
          .select('id')
          .eq('restaurant_id', ctx.restaurantId)
          .maybeSingle();
        if (pol) {
          await db.from('payout_policies').update({ config: merged as never, active: true, updated_at: new Date().toISOString() }).eq('id', pol.id);
        } else {
          await db.from('payout_policies').insert({ restaurant_id: ctx.restaurantId, name: 'Do estabelecimento', config: merged as never, active: true });
        }
      }
    }

    const businessHours = sanitizeBusinessHours(body.businessHours);

    const upd: Database['public']['Tables']['restaurants']['Update'] = {
      logistics_config: logistics as unknown as Database['public']['Tables']['restaurants']['Update']['logistics_config'],
    };
    if (businessHours) upd.business_hours = businessHours as unknown as Database['public']['Tables']['restaurants']['Update']['business_hours'];
    if (typeof body.latitude === 'number' && typeof body.longitude === 'number') {
      upd.latitude = body.latitude;
      upd.longitude = body.longitude;
    }
    if (body.whatsapp !== undefined) upd.phone = body.whatsapp;
    await db.from('restaurants').update(upd).eq('id', ctx.restaurantId);

    return json({ ok: true, warnings: [] });
  } catch (e) {
    return serverError(e);
  }
}
