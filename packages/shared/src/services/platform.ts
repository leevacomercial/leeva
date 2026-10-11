/**
 * PLATAFORMA (painel admin do Leeva) — agregações entre TODOS os restaurantes.
 *
 * Só o operador da plataforma (is_platform_admin) acessa. Os números vêm do
 * banco; nada fictício. LTV/Churn só quando há amostra suficiente.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';
import { mapClientConfig } from './map';

type DB = SupabaseClient<Database>;
const round = (n: number, dp = 2) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};
const pct = (cur: number, prev: number): number | null =>
  prev > 0 ? round(((cur - prev) / prev) * 100, 1) : null;

export type AdminPeriod = 'today' | '7d' | '30d' | 'month';

export type DispatchHealth = {
  status: 'ok' | 'warn' | 'down' | 'unknown';
  lastRunAt: string | null;
  secondsSinceLastRun: number | null;
  runsLastHour: number;
  errorsLastHour: number;
  skippedLastHour: number;
  avgDurationMs: number | null;
  message: string;
};

/** Saúde do motor de despacho: o cron (pg_cron → /api/cron/dispatch-tick) está rodando? */
export async function getDispatchHealth(db: DB): Promise<DispatchHealth> {
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const { data } = await db
    .from('dispatch_runs')
    .select('started_at, finished_at, duration_ms, error, skipped, source')
    .gte('started_at', hourAgo)
    .order('started_at', { ascending: false })
    .limit(500);

  const rows = data ?? [];
  const last = rows[0];
  const lastRunAt = last?.started_at ?? null;
  const secondsSinceLastRun = lastRunAt ? Math.round((Date.now() - new Date(lastRunAt).getTime()) / 1000) : null;
  const errorsLastHour = rows.filter((r) => r.error).length;
  const skippedLastHour = rows.filter((r) => r.skipped).length;
  const durations = rows.map((r) => r.duration_ms).filter((d): d is number => typeof d === 'number' && d > 0);
  const avgDurationMs = durations.length ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length) : null;

  let status: DispatchHealth['status'];
  let message: string;
  if (secondsSinceLastRun == null) {
    status = 'down';
    message = 'Nenhuma execução na última hora. O cron pode estar parado — ver docs/DEPLOY.md §4.';
  } else if (secondsSinceLastRun <= 120) {
    status = 'ok';
    message = `Rodando normalmente (última execução há ${secondsSinceLastRun}s).`;
  } else if (secondsSinceLastRun <= 900) {
    status = 'warn';
    message = `Última execução há ${Math.round(secondsSinceLastRun / 60)} min — deveria ser a cada ~30s.`;
  } else {
    status = 'down';
    message = `Sem executar há ${Math.round(secondsSinceLastRun / 60)} min. O cron provavelmente caiu.`;
  }
  if (status === 'ok' && errorsLastHour > 0) {
    status = 'warn';
    message += ` ${errorsLastHour} execução(ões) com erro na última hora.`;
  }

  return {
    status,
    lastRunAt,
    secondsSinceLastRun,
    runsLastHour: rows.length,
    errorsLastHour,
    skippedLastHour,
    avgDurationMs,
    message,
  };
}

function ranges(period: AdminPeriod) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let from: Date;
  let days: number;
  switch (period) {
    case 'today':
      from = start;
      days = 1;
      break;
    case '7d':
      from = new Date(start);
      from.setDate(from.getDate() - 6);
      days = 7;
      break;
    case 'month':
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      days = Math.max(1, Math.round((now.getTime() - from.getTime()) / 86400_000));
      break;
    case '30d':
    default:
      from = new Date(start);
      from.setDate(from.getDate() - 29);
      days = 30;
      break;
  }
  const prevFrom = new Date(from);
  prevFrom.setDate(prevFrom.getDate() - days);
  return { from: from.toISOString(), to: now.toISOString(), prevFrom: prevFrom.toISOString(), prevTo: from.toISOString(), days };
}

// ===========================================================================
// VISÃO GERAL
// ===========================================================================

export type AdminOverview = {
  period: AdminPeriod;
  mrr: number;
  saasRevenue: number;
  deliveryRevenue: number;
  totalRevenue: number;
  driverCost: number;
  logisticsMargin: number;
  restaurantsActive: number;
  restaurantsTrial: number;
  deliveriesToday: number;
  deliveries7d: number;
  motoboysRegistered: number;
  motoboysOnline: number;
  deliveriesNoDriver: number;
  dispatchHealth: DispatchHealth;
  deltas: {
    saasRevenue: number | null;
    deliveryRevenue: number | null;
    totalRevenue: number | null;
    deliveries: number | null;
    logisticsMargin: number | null;
  };
};

export async function getAdminOverview(db: DB, period: AdminPeriod = '30d'): Promise<AdminOverview> {
  const { from, to, prevFrom, prevTo } = ranges(period);

  // assinaturas + planos (MRR)
  const { data: subs } = await db.from('subscriptions').select('status, plans(monthly_price)').limit(5000);
  let mrr = 0;
  let restaurantsActive = 0;
  let restaurantsTrial = 0;
  for (const s of subs ?? []) {
    const price = Number((s as { plans?: { monthly_price?: number } }).plans?.monthly_price ?? 0);
    if (s.status === 'active') {
      mrr += price;
      restaurantsActive++;
    } else if (s.status === 'trialing') {
      restaurantsTrial++;
    }
  }

  // billing_events do período (receita SaaS + variável)
  const sumBilling = async (f: string, t: string) => {
    const { data } = await db
      .from('billing_events')
      .select('type, amount, created_at')
      .gte('created_at', f)
      .lt('created_at', t)
      .limit(100000);
    let saas = 0;
    let delivery = 0;
    for (const b of data ?? []) {
      const a = Number(b.amount ?? 0);
      if (b.type === 'subscription_fee') saas += a;
      else if (b.type === 'delivery_fee') delivery += a;
    }
    return { saas: round(saas), delivery: round(delivery) };
  };
  const cur = await sumBilling(from, to);
  const prev = await sumBilling(prevFrom, prevTo);

  // entregas concluídas do período (custo + margem)
  const deliveriesAgg = async (f: string, t: string) => {
    const { data } = await db
      .from('orders')
      .select('driver_payout, leeva_fee, logistics_margin, delivered_at')
      .eq('status', 'delivered')
      .gte('delivered_at', f)
      .lt('delivered_at', t)
      .limit(200000);
    let cost = 0;
    let margin = 0;
    let n = 0;
    for (const o of data ?? []) {
      if (o.driver_payout == null) continue;
      cost += Number(o.driver_payout ?? 0);
      margin += Number(o.logistics_margin ?? 0);
      n++;
    }
    return { cost: round(cost), margin: round(margin), n };
  };
  const curD = await deliveriesAgg(from, to);
  const prevD = await deliveriesAgg(prevFrom, prevTo);

  // contadores instantâneos
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const d7 = new Date();
  d7.setDate(d7.getDate() - 7);
  const [today, week, motoTotal, motoOnline, noDriver] = await Promise.all([
    db.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'delivered').gte('delivered_at', startToday.toISOString()),
    db.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'delivered').gte('delivered_at', d7.toISOString()),
    db.from('motoboys').select('id', { count: 'exact', head: true }).eq('active', true),
    db.from('motoboys').select('id', { count: 'exact', head: true }).eq('active', true).neq('status', 'offline'),
    db.from('orders').select('id', { count: 'exact', head: true }).eq('dispatch_state', 'failed'),
  ]);

  const totalRevenue = round(cur.saas + cur.delivery);
  const prevTotal = round(prev.saas + prev.delivery);
  const dispatchHealth = await getDispatchHealth(db);

  return {
    period,
    mrr: round(mrr),
    saasRevenue: cur.saas,
    deliveryRevenue: cur.delivery,
    totalRevenue,
    driverCost: curD.cost,
    logisticsMargin: curD.margin,
    restaurantsActive,
    restaurantsTrial,
    deliveriesToday: today.count ?? 0,
    deliveries7d: week.count ?? 0,
    motoboysRegistered: motoTotal.count ?? 0,
    motoboysOnline: motoOnline.count ?? 0,
    deliveriesNoDriver: noDriver.count ?? 0,
    dispatchHealth,
    deltas: {
      saasRevenue: pct(cur.saas, prev.saas),
      deliveryRevenue: pct(cur.delivery, prev.delivery),
      totalRevenue: pct(totalRevenue, prevTotal),
      deliveries: pct(curD.n, prevD.n),
      logisticsMargin: pct(curD.margin, prevD.margin),
    },
  };
}

// ===========================================================================
// CLIENTES E ASSINATURAS
// ===========================================================================

export type AdminRestaurantRow = {
  id: string;
  name: string;
  plan: string | null;
  status: string | null;
  onboardingCompleted: boolean;
  /** fim do período pago (ativo) ou do teste (trialing) */
  dueAt: string | null;
  monthlyPrice: number;
  teamSize: number;
  deliveries30d: number;
  mrr: number;
  variable30d: number;
  createdAt: string;
  trialEndsAt: string | null;
  lastActivityAt: string | null;
};

export async function listRestaurants(
  db: DB,
  filter: { status?: string; plan?: string } = {},
): Promise<AdminRestaurantRow[]> {
  const { data: rests } = await db
    .from('restaurants')
    .select('id, name, created_at, onboarding_completed')
    .order('created_at', { ascending: false })
    .limit(2000);
  if (!rests?.length) return [];

  const ids = rests.map((r) => r.id);
  const { data: subs } = await db
    .from('subscriptions')
    .select('restaurant_id, status, trial_ends_at, current_period_end, plans(code, name, monthly_price)')
    .in('restaurant_id', ids);
  const subByRest = new Map((subs ?? []).map((s) => [s.restaurant_id, s]));

  const d30 = new Date();
  d30.setDate(d30.getDate() - 30);
  const { data: bills } = await db
    .from('billing_events')
    .select('restaurant_id, type, amount, created_at')
    .in('restaurant_id', ids)
    .gte('created_at', d30.toISOString())
    .limit(200000);
  const varByRest = new Map<string, number>();
  for (const b of bills ?? []) {
    if (b.type === 'delivery_fee') varByRest.set(b.restaurant_id, (varByRest.get(b.restaurant_id) ?? 0) + Number(b.amount ?? 0));
  }

  const { data: dels } = await db
    .from('orders')
    .select('restaurant_id, delivered_at')
    .in('restaurant_id', ids)
    .eq('status', 'delivered')
    .gte('delivered_at', d30.toISOString())
    .limit(300000);
  const delByRest = new Map<string, number>();
  const lastByRest = new Map<string, string>();
  for (const o of dels ?? []) {
    delByRest.set(o.restaurant_id, (delByRest.get(o.restaurant_id) ?? 0) + 1);
    if (o.delivered_at && (!lastByRest.get(o.restaurant_id) || o.delivered_at > lastByRest.get(o.restaurant_id)!))
      lastByRest.set(o.restaurant_id, o.delivered_at);
  }

  const { data: team } = await db
    .from('motoboys')
    .select('restaurant_id')
    .in('restaurant_id', ids)
    .eq('fleet', 'own')
    .eq('active', true)
    .limit(100000);
  const teamByRest = new Map<string, number>();
  for (const m of team ?? []) if (m.restaurant_id) teamByRest.set(m.restaurant_id, (teamByRest.get(m.restaurant_id) ?? 0) + 1);

  let rows: AdminRestaurantRow[] = rests.map((r) => {
    const sub = subByRest.get(r.id) as
      | { status?: string; trial_ends_at?: string | null; current_period_end?: string | null; plans?: { code?: string; name?: string; monthly_price?: number } }
      | undefined;
    return {
      id: r.id,
      name: r.name,
      plan: sub?.plans?.name ?? null,
      status: sub?.status ?? null,
      onboardingCompleted: !!r.onboarding_completed,
      dueAt: sub?.status === 'trialing' ? (sub?.trial_ends_at ?? null) : (sub?.current_period_end ?? null),
      monthlyPrice: round(Number(sub?.plans?.monthly_price ?? 0)),
      teamSize: teamByRest.get(r.id) ?? 0,
      deliveries30d: delByRest.get(r.id) ?? 0,
      mrr: sub?.status === 'active' ? round(Number(sub?.plans?.monthly_price ?? 0)) : 0,
      variable30d: round(varByRest.get(r.id) ?? 0),
      createdAt: r.created_at,
      trialEndsAt: sub?.trial_ends_at ?? null,
      lastActivityAt: lastByRest.get(r.id) ?? null,
    };
  });

  if (filter.status) rows = rows.filter((r) => r.status === filter.status);
  if (filter.plan) rows = rows.filter((r) => (r.plan ?? '').toLowerCase() === filter.plan!.toLowerCase());
  return rows;
}

export async function getRestaurantDetail(db: DB, restaurantId: string) {
  const { data: r } = await db.from('restaurants').select('*').eq('id', restaurantId).maybeSingle();
  if (!r) return null;
  const { data: sub } = await db
    .from('subscriptions')
    .select('*, plans(*)')
    .eq('restaurant_id', restaurantId)
    .maybeSingle();
  const { data: users } = await db
    .from('users')
    .select('id, full_name, role')
    .eq('restaurant_id', restaurantId);
  const { data: integrations } = await db
    .from('integrations')
    .select('provider, status, credentials_set, last_event_at')
    .eq('restaurant_id', restaurantId);
  const { data: payout } = await db
    .from('payout_policies')
    .select('name, config, active')
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  const d30 = new Date();
  d30.setDate(d30.getDate() - 30);
  const { data: dels } = await db
    .from('orders')
    .select('status, driver_payout, delivered_at, created_at')
    .eq('restaurant_id', restaurantId)
    .gte('created_at', d30.toISOString())
    .limit(50000);
  let delivered = 0;
  let cost = 0;
  for (const o of dels ?? []) {
    if (o.status === 'delivered') {
      delivered++;
      cost += Number(o.driver_payout ?? 0);
    }
  }
  const { data: recentBilling } = await db
    .from('billing_events')
    .select('type, amount, description, created_at')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })
    .limit(20);

  const { data: drivers } = await db
    .from('motoboys')
    .select('id, full_name, phone, status, active, user_id, deliveries_completed')
    .eq('restaurant_id', restaurantId)
    .eq('fleet', 'own')
    .order('full_name');
  const { data: plans } = await db.from('plans').select('code, name, monthly_price').eq('active', true).order('sort_order');

  return {
    restaurant: r,
    subscription: sub,
    team: users ?? [],
    integrations: integrations ?? [],
    payoutPolicy: payout ?? null,
    drivers: drivers ?? [],
    plans: plans ?? [],
    usage30d: {
      delivered,
      driverCost: round(cost),
      ordersCreated: (dels ?? []).length,
    },
    recentBilling: recentBilling ?? [],
  };
}

// ===========================================================================
// ENTREGADORES DA REDE
// ===========================================================================

export type AdminDriverRow = {
  id: string;
  name: string;
  fleet: 'own' | 'leeva';
  restaurantId: string | null;
  status: string;
  active: boolean;
  blocked: boolean;
  deliveriesTotal: number;
  acceptanceRate: number;
  completionRate: number;
  punctualityRate: number;
  rating: number;
  reliabilityIndex: number;
  phone: string | null;
};

export async function listDrivers(
  db: DB,
  filter: { fleet?: 'own' | 'leeva'; status?: string; blocked?: boolean } = {},
): Promise<{ rows: AdminDriverRow[]; totals: Record<string, number> }> {
  let q = db
    .from('motoboys')
    .select(
      'id, full_name, phone, fleet, restaurant_id, status, active, blocked, deliveries_total, acceptance_rate, completion_rate_pct, punctuality_rate, rating, reliability_index',
    )
    .order('reliability_index', { ascending: false })
    .limit(5000);
  if (filter.fleet) q = q.eq('fleet', filter.fleet);
  const { data } = await q;

  let rows: AdminDriverRow[] = (data ?? []).map((m) => ({
    id: m.id,
    name: m.full_name,
    fleet: m.fleet as 'own' | 'leeva',
    restaurantId: m.restaurant_id,
    status: m.status,
    active: !!m.active,
    blocked: !!m.blocked,
    deliveriesTotal: m.deliveries_total ?? 0,
    acceptanceRate: Number(m.acceptance_rate ?? 100),
    completionRate: Number(m.completion_rate_pct ?? 100),
    punctualityRate: Number(m.punctuality_rate ?? 100),
    rating: Number(m.rating ?? 5),
    reliabilityIndex: Number(m.reliability_index ?? 100),
    phone: m.phone ?? null,
  }));

  if (filter.status) rows = rows.filter((r) => r.status === filter.status);
  if (filter.blocked != null) rows = rows.filter((r) => r.blocked === filter.blocked);

  const totals = {
    total: rows.length,
    online: rows.filter((r) => r.status !== 'offline' && r.active).length,
    offline: rows.filter((r) => r.status === 'offline').length,
    onDelivery: rows.filter((r) => r.status === 'on_delivery').length,
    available: rows.filter((r) => r.status === 'available').length,
    blocked: rows.filter((r) => r.blocked).length,
  };
  return { rows, totals };
}

// ===========================================================================
// OPERAÇÃO DA REDE (mapa geral)
// ===========================================================================

export type NetworkOperation = {
  mapConfig: { tileUrl: string; attribution: string };
  restaurants: { id: string; name: string; lat: number; lng: number }[];
  drivers: { id: string; name: string; lat: number; lng: number; status: string }[];
  activeOrders: {
    id: string;
    orderNumber: number | null;
    restaurantId: string;
    lat: number;
    lng: number;
    status: string;
    region: string | null;
    dispatchState: string;
  }[];
  regionDemand: { region: string; active: number; noDriver: number }[];
  gaps: string[];
};

export async function getNetworkOperation(
  db: DB,
  filter: { region?: string; restaurantId?: string; status?: string } = {},
): Promise<NetworkOperation> {
  const [{ data: rests }, { data: drivers }] = await Promise.all([
    db.from('restaurants').select('id, name, latitude, longitude').limit(3000),
    db
      .from('motoboys')
      .select('id, full_name, current_latitude, current_longitude, status, location_updated_at')
      .eq('active', true)
      .neq('status', 'offline')
      .limit(5000),
  ]);

  let oq = db
    .from('orders')
    .select('id, order_number, restaurant_id, latitude, longitude, status, region, dispatch_state')
    .in('status', ['assigned', 'picked_up', 'in_route', 'ready', 'preparing', 'waiting_dispatch'])
    .limit(20000);
  if (filter.restaurantId) oq = oq.eq('restaurant_id', filter.restaurantId);
  if (filter.status) oq = oq.eq('status', filter.status as Database['public']['Enums']['order_status']);
  if (filter.region) oq = oq.eq('region', filter.region);
  const { data: orders } = await oq;

  const fresh = (t: string | null) => t != null && Date.now() - new Date(t).getTime() < 15 * 60_000;

  const regionMap = new Map<string, { active: number; noDriver: number }>();
  for (const o of orders ?? []) {
    const r = o.region || 'Sem região';
    const e = regionMap.get(r) ?? { active: 0, noDriver: 0 };
    e.active++;
    if (o.dispatch_state === 'failed' || o.dispatch_state === 'searching') e.noDriver++;
    regionMap.set(r, e);
  }
  const regionDemand = [...regionMap.entries()]
    .map(([region, e]) => ({ region, ...e }))
    .sort((a, b) => b.active - a.active);

  const gaps: string[] = [];
  for (const rd of regionDemand) {
    if (rd.noDriver >= 3) gaps.push(`${rd.region}: ${rd.noDriver} entregas sem entregador`);
  }
  const onlineDrivers = (drivers ?? []).filter((d) => fresh(d.location_updated_at) && d.current_latitude != null);
  if (onlineDrivers.length === 0 && (orders ?? []).length > 0)
    gaps.push('Nenhum entregador com posição recente e demanda ativa na rede.');

  return {
    mapConfig: mapClientConfig(),
    restaurants: (rests ?? [])
      .filter((r) => r.latitude != null && r.longitude != null)
      .map((r) => ({ id: r.id, name: r.name, lat: Number(r.latitude), lng: Number(r.longitude) })),
    drivers: onlineDrivers.map((d) => ({
      id: d.id,
      name: (d.full_name ?? '').split(' ')[0] ?? 'Entregador',
      lat: Number(d.current_latitude),
      lng: Number(d.current_longitude),
      status: d.status,
    })),
    activeOrders: (orders ?? [])
      .filter((o) => o.latitude != null && o.longitude != null)
      .map((o) => ({
        id: o.id,
        orderNumber: o.order_number,
        restaurantId: o.restaurant_id,
        lat: Number(o.latitude),
        lng: Number(o.longitude),
        status: o.status,
        region: o.region,
        dispatchState: o.dispatch_state,
      })),
    regionDemand,
    gaps,
  };
}
