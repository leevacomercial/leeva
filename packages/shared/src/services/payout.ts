/**
 * Motor de remuneração do entregador — configurável, transparente,
 * independente da taxa cobrada do cliente.
 *
 * A política fica em `payout_policies.config` (por restaurante, ou a global).
 * Nada de valor hardcoded na regra de negócio: o cálculo lê a config.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';
import type { PayoutConfig, LogisticsConfig } from '../types';
import { haversineKm, minutesForKm, isValidLatLng, type LatLng } from './geo';
import { getRoutingService } from './routing';

type DB = SupabaseClient<Database>;

export const DEFAULT_PAYOUT_CONFIG: PayoutConfig = {
  per_km: 2.0,
  per_km_grouped: 2.5,
  min_payout: 5,
  peak_bonus: 0,
  peak_hours: [[18, 21]],
  group_radius_km: 1,
  group_max_stops: 3,
};

/** Margem default do Leeva por entrega quando o restaurante não tem plano. */
export const DEFAULT_PLAN_MARGIN = 1.0;

export type PayoutInput = {
  distanceKm: number | null;
  /** instante da entrega (para bônus de pico); default = agora */
  at?: Date;
};

export type PayoutResult = {
  total: number;
  breakdown: { label: string; amount: number }[];
  config: PayoutConfig;
};

function isPeak(config: PayoutConfig, at: Date): boolean {
  const h = at.getHours();
  return (config.peak_hours ?? []).some(([start, end]) => h >= start && h < end);
}

/**
 * Calcula a remuneração de uma entrega solta (ou da 1ª parada/líder de uma
 * rota agrupada — mesma fórmula, distância do restaurante até ela):
 *   max(distanceKm × per_km, min_payout) + peak_bonus (se pico)
 */
export function computeDriverPayout(config: PayoutConfig, input: PayoutInput): PayoutResult {
  const c = { ...DEFAULT_PAYOUT_CONFIG, ...config };
  const at = input.at ?? new Date();
  const distanceKm = Math.max(0, input.distanceKm ?? 0);
  const breakdown: { label: string; amount: number }[] = [];

  const byDistance = round(distanceKm * c.per_km);
  breakdown.push({ label: `Distância (${distanceKm.toFixed(1)} km × ${money(c.per_km)})`, amount: byDistance });

  let total = byDistance;
  if (total < c.min_payout) {
    breakdown.push({ label: 'Ajuste ao mínimo', amount: round(c.min_payout - total) });
    total = round(c.min_payout);
  }

  if (c.peak_bonus > 0 && isPeak(c, at)) {
    breakdown.push({ label: 'Bônus de pico', amount: round(c.peak_bonus) });
    total = round(total + c.peak_bonus);
  }

  return { total, breakdown, config: c };
}

/**
 * Remuneração de uma parada ADICIONAL (não-líder) de rota agrupada, sobre o
 * trecho incremental (da parada anterior até esta):
 *   max(legKm × per_km_grouped, min_payout)
 * Taxa por km mais alta que a entrega solta — compensa o motoboy por aceitar
 * agrupar — mas o mesmo piso mínimo.
 */
export function computeGroupedStopPayout(config: PayoutConfig, legKm: number): number {
  const c = { ...DEFAULT_PAYOUT_CONFIG, ...config };
  const km = Math.max(0, legKm);
  return round(Math.max(km * c.per_km_grouped, c.min_payout));
}

/** Carrega a política de payout do restaurante (ou a global). */
export async function getPayoutPolicy(db: DB, restaurantId: string): Promise<PayoutConfig> {
  const { data: own } = await db
    .from('payout_policies')
    .select('config')
    .eq('restaurant_id', restaurantId)
    .eq('active', true)
    .maybeSingle();
  if (own?.config) return { ...DEFAULT_PAYOUT_CONFIG, ...(own.config as PayoutConfig) };

  const { data: global } = await db
    .from('payout_policies')
    .select('config')
    .is('restaurant_id', null)
    .eq('active', true)
    .maybeSingle();
  return { ...DEFAULT_PAYOUT_CONFIG, ...((global?.config as PayoutConfig) ?? {}) };
}

/**
 * Financeiro da logística de uma entrega:
 *  taxa cobrada do cliente/restaurante  (customer_fee)
 *  − remuneração do entregador          (driver_payout)
 *  = margem logística                   (logistics_margin)
 *
 * A taxa cobrada vem de: order.customer_fee → order.delivery_fee → logistics_config.customer_fee.
 */
export function computeLogisticsFinance(args: {
  customerFee: number;
  driverPayout: number;
}): { leevaFee: number; driverPayout: number; margin: number } {
  const leevaFee = round(Math.max(0, args.customerFee));
  const driverPayout = round(Math.max(0, args.driverPayout));
  return { leevaFee, driverPayout, margin: round(leevaFee - driverPayout) };
}

const round = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => `R$ ${n.toFixed(2)}`;

// ===========================================================================
// FASE 4 — cálculo automático da taxa de entrega (fonte única)
// ===========================================================================

/**
 * Frota própria (modelo mensal, estilo Foody): o estabelecimento usa os
 * próprios motoboys e paga eles direto. O Leeva só cobra a mensalidade —
 * nada por entrega, sem crédito, sem carteira do motoboy.
 */
export async function isOwnFleetMonthly(db: DB, restaurantId: string): Promise<boolean> {
  const { data } = await db.from('restaurants').select('fleet_mode').eq('id', restaurantId).maybeSingle();
  return data?.fleet_mode === 'own';
}

/** "Jardim Oceania" == "jardim oceânia" == "JD. OCEANIA" — sem acento, caixa e abreviação. */
export function normalizeBairro(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\bjd\.?(?=\s)/g, 'jardim')
    .replace(/\bpq\.?(?=\s)/g, 'parque')
    .replace(/\bres\.?(?=\s)/g, 'residencial')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Taxa do bairro, se o estabelecimento cadastrou uma pra ele. Compara com o
 * bairro do pedido e, se não bater, procura o nome do bairro dentro do
 * endereço (o bairro nem sempre vem separado). Nome mais longo ganha
 * ("Jardim Cidade Universitária" antes de "Cidade Universitária").
 */
export type BairroEntry = { region: string; fee: number; driver_pay?: number | null };

/** A linha da tabela de bairros que vale pra este endereço (ou null). */
export function findBairroEntry(
  table: BairroEntry[] | null | undefined,
  region: string | null | undefined,
  address?: string | null,
): BairroEntry | null {
  if (!table?.length) return null;
  const r = normalizeBairro(region);
  const addr = ` ${normalizeBairro(address)} `;
  const sorted = [...table].sort((a, b) => b.region.length - a.region.length);
  for (const e of sorted) {
    const n = normalizeBairro(e.region);
    if (n && n === r) return e;
  }
  for (const e of sorted) {
    const n = normalizeBairro(e.region);
    if (n && addr.includes(` ${n} `)) return e;
  }
  return null;
}

export function findBairroFee(
  table: BairroEntry[] | null | undefined,
  region: string | null | undefined,
  address?: string | null,
): number | null {
  const e = findBairroEntry(table, region, address);
  return e ? Math.max(0, e.fee) : null;
}

/**
 * Taxa de entrega cobrada do CLIENTE final, definida pelo estabelecimento:
 *   pedido ≥ `free_delivery_min_order` → grátis
 *   bairro cadastrado em `customer_fee_by_region` → taxa do bairro
 *   senão: até `customer_fee_included_km` km → `customer_fee`
 *          cada km a mais                    → + `customer_fee_per_extra_km`
 * É dinheiro do estabelecimento; o Leeva só calcula e mostra.
 */
export function computeCustomerDeliveryFee(
  cfg: Pick<LogisticsConfig, 'customer_fee' | 'free_delivery_min_order'> &
    Partial<Pick<LogisticsConfig, 'customer_fee_included_km' | 'customer_fee_per_extra_km' | 'customer_fee_by_region'>>,
  distanceKm: number | null,
  orderAmount?: number | null,
  where?: { region?: string | null; address?: string | null },
): number {
  if (cfg.free_delivery_min_order != null && orderAmount != null && orderAmount >= cfg.free_delivery_min_order) return 0;
  const byBairro = findBairroFee(cfg.customer_fee_by_region, where?.region, where?.address);
  if (byBairro != null) return round(byBairro);
  const base = Math.max(0, cfg.customer_fee ?? 0);
  const perExtra = Math.max(0, cfg.customer_fee_per_extra_km ?? 0);
  const included = Math.max(0, cfg.customer_fee_included_km ?? 0);
  const extraKm = distanceKm != null ? Math.max(0, distanceKm - included) : 0;
  return round(base + extraKm * perExtra);
}

/** Margem do Leeva por entrega, do plano do restaurante (zero na frota própria). */
export async function getPlanMargin(db: DB, restaurantId: string): Promise<number> {
  if (await isOwnFleetMonthly(db, restaurantId)) return 0;
  const { data } = await db
    .from('subscriptions')
    .select('plans(per_delivery_margin)')
    .eq('restaurant_id', restaurantId)
    .maybeSingle();
  const m = (data as { plans?: { per_delivery_margin?: number | string } } | null)?.plans?.per_delivery_margin;
  return m != null ? Number(m) : DEFAULT_PLAN_MARGIN;
}

export type DeliveryCharge = {
  distanceKm: number | null;
  durationMin: number | null;
  driverPayout: number; // 100% para o motoboy
  margin: number; // margem do Leeva (do plano)
  total: number; // descontado do crédito do restaurante = driverPayout + margin (0 na frota própria)
  /** frota própria: o estabelecimento paga o motoboy direto, o Leeva não cobra por entrega */
  ownFleet: boolean;
  /** taxa de entrega do cliente final pela tabela do estabelecimento */
  customerDeliveryFee: number;
  /** bairro da tabela que foi usado (null = regra por km) */
  bairro: string | null;
  breakdown: { label: string; amount: number }[];
};

/**
 * Calcula a taxa da entrega SEM gravar — para pré-visualização no formulário
 * de nova entrega. Mesma fórmula do `finalizeDeliveryCharge`.
 */
export async function computeDeliveryCharge(
  db: DB,
  restaurantId: string,
  dropoff: { latitude: number; longitude: number } | null,
  orderAmount?: number | null,
  where?: { region?: string | null; address?: string | null },
): Promise<DeliveryCharge> {
  const { data: rst } = await db
    .from('restaurants')
    .select('latitude, longitude, fleet_mode, logistics_config')
    .eq('id', restaurantId)
    .maybeSingle();
  const ownFleet = rst?.fleet_mode === 'own';

  const pickup: LatLng | null = isValidLatLng(rst?.latitude, rst?.longitude)
    ? { latitude: rst!.latitude as number, longitude: rst!.longitude as number }
    : null;
  const drop: LatLng | null =
    dropoff && isValidLatLng(dropoff.latitude, dropoff.longitude)
      ? { latitude: dropoff.latitude, longitude: dropoff.longitude }
      : null;

  let distanceKm: number | null = null;
  let durationMin: number | null = null;
  if (pickup && drop) {
    const leg = await getRoutingService().leg(pickup, drop);
    distanceKm = leg?.distanceKm ?? (haversineKm(pickup, drop) ?? null);
    if (!leg && distanceKm != null) distanceKm = round(distanceKm * 1.3);
    durationMin = leg?.durationMin ?? (distanceKm != null ? minutesForKm(distanceKm) : null);
  }

  const { DEFAULT_LOGISTICS_CONFIG } = await import('./autodispatch');
  const cfg = { ...DEFAULT_LOGISTICS_CONFIG, ...((rst?.logistics_config as Partial<LogisticsConfig>) ?? {}) };
  const bairro = findBairroEntry(cfg.customer_fee_by_region, where?.region, where?.address);

  const policy = await getPayoutPolicy(db, restaurantId);
  // bairro com valor do motoboy definido manda; senão, a regra por km
  const payout =
    bairro?.driver_pay != null && Number.isFinite(Number(bairro.driver_pay))
      ? { total: round(Math.max(0, Number(bairro.driver_pay))), breakdown: [{ label: `Bairro ${bairro.region}`, amount: round(Math.max(0, Number(bairro.driver_pay))) }] }
      : computeDriverPayout(policy, { distanceKm });
  const margin = ownFleet ? 0 : round(await getPlanMargin(db, restaurantId));
  const total = ownFleet ? 0 : round(payout.total + margin);
  const customerDeliveryFee = computeCustomerDeliveryFee(cfg, distanceKm != null ? round(distanceKm) : null, orderAmount, where);

  return {
    distanceKm: distanceKm != null ? round(distanceKm) : null,
    durationMin: durationMin != null ? Math.round(durationMin) : null,
    driverPayout: payout.total,
    margin,
    total,
    ownFleet,
    customerDeliveryFee,
    bairro: bairro?.region ?? null,
    breakdown: ownFleet
      ? payout.breakdown
      : [...payout.breakdown, { label: 'Margem Leeva (plano)', amount: margin }],
  };
}

/**
 * Calcula a taxa da entrega UMA VEZ (na criação do pedido) e grava no pedido.
 *
 *   valor do motoboy = max(distância × per_km, min_payout)
 *   distância        = linha reta × 1,3 (fator de rua) — via RoutingService
 *   total cobrado    = valor do motoboy + margem do plano
 *
 * Se o pedido já pertence a uma rota agrupada (group_id), o valor por parada
 * já foi calculado e gravado por `grouping-dispatch.ts` (applyGroupPlan) —
 * esta função nunca recalcula um pedido agrupado, só entregas soltas.
 *
 * Depois disso, a oferta, a tela do restaurante e o pagamento leem SEMPRE
 * `orders.driver_payout` / `orders.customer_fee` — nada é recalculado.
 * Idempotente: se `driver_payout` já está setado, não faz nada.
 */
export async function finalizeDeliveryCharge(
  db: DB,
  orderId: string,
  restaurantId: string,
): Promise<DeliveryCharge | null> {
  const { data: order } = await db
    .from('orders')
    .select('id, latitude, longitude, driver_payout, delivery_fee, order_amount, region, customer_address')
    .eq('id', orderId)
    .maybeSingle();
  if (!order || order.driver_payout != null) return null;

  const charge = await computeDeliveryCharge(
    db,
    restaurantId,
    order.latitude != null && order.longitude != null
      ? { latitude: Number(order.latitude), longitude: Number(order.longitude) }
      : null,
    Number(order.order_amount ?? 0),
    { region: order.region, address: order.customer_address },
  );

  await db
    .from('orders')
    .update({
      route_distance_km: charge.distanceKm,
      route_duration_min: charge.durationMin,
      driver_payout: charge.driverPayout,
      // customer_fee / leeva_fee = TOTAL cobrado do restaurante.
      // logistics_margin (coluna gerada) = leeva_fee − driver_payout = margem do Leeva.
      customer_fee: charge.total,
      leeva_fee: charge.total,
      // frota própria: taxa do cliente pela tabela do estabelecimento — só
      // se o canal de venda não trouxe uma (site/iFood já cobraram a deles)
      ...(charge.ownFleet && !(Number(order.delivery_fee) > 0) ? { delivery_fee: charge.customerDeliveryFee } : {}),
    })
    .eq('id', orderId);

  return charge;
}
