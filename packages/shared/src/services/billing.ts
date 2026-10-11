/**
 * Billing SaaS — planos, assinatura, uso e fatura estimada.
 *
 * Modelo: só mensalidade (frota própria). O valor por entrega dos planos
 * antigos fica em 0 — a cobrança é manual, marcada pelo admin.
 * As regras de plano ficam em `plans.features` (jsonb), nunca espalhadas
 * pelo código.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';
import type { PlanFeatures } from '../types';

type DB = SupabaseClient<Database>;

/** Plano padrão de quem chega: o mensal da frota própria. */
export const DEFAULT_PLAN_CODE = 'mensal';

/** Garante que o restaurante tem uma assinatura; cria em teste grátis no plano dado (ou no mensal). */
export async function ensureSubscription(db: DB, restaurantId: string, planCode = DEFAULT_PLAN_CODE) {
  const { data: existing } = await db
    .from('subscriptions')
    .select('*, plans(*)')
    .eq('restaurant_id', restaurantId)
    .maybeSingle();
  if (existing) return existing;

  let { data: plan } = await db.from('plans').select('*').eq('code', planCode).maybeSingle();
  if (!plan) {
    // plano pedido não existe: cai no primeiro plano ativo (ordem do admin)
    ({ data: plan } = await db.from('plans').select('*').eq('active', true).order('sort_order').limit(1).maybeSingle());
  }
  if (!plan) throw new Error(`plano '${planCode}' não existe`);

  const now = new Date();
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const { data: created, error } = await db
    .from('subscriptions')
    .upsert(
      {
        restaurant_id: restaurantId,
        plan_id: plan.id,
        status: plan.trial_days > 0 ? 'trialing' : 'active',
        current_period_start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
        current_period_end: periodEnd.toISOString(),
        trial_ends_at:
          plan.trial_days > 0 ? new Date(now.getTime() + plan.trial_days * 864e5).toISOString() : null,
      },
      { onConflict: 'restaurant_id', ignoreDuplicates: true },
    )
    .select('*, plans(*)')
    .maybeSingle();

  if (created) return created;
  // corrida: outra requisição criou ao mesmo tempo
  const { data: raced } = await db
    .from('subscriptions')
    .select('*, plans(*)')
    .eq('restaurant_id', restaurantId)
    .maybeSingle();
  if (raced) return raced;
  throw new Error(`falha ao criar assinatura: ${error?.message ?? 'desconhecido'}`);
}

export type SubscriptionRow = NonNullable<Awaited<ReturnType<typeof ensureSubscription>>>;

/**
 * Troca o plano da assinatura. NÃO mexe no status: trocar de plano não é
 * pagar — quem está em teste continua em teste, quem está inadimplente
 * continua inadimplente. Só "marcar como pago" (admin) ativa.
 */
export async function changePlan(db: DB, restaurantId: string, planCode: string) {
  const { data: plan } = await db.from('plans').select('id').eq('code', planCode).eq('active', true).maybeSingle();
  if (!plan) return { ok: false as const, error: 'plano inválido' };
  await ensureSubscription(db, restaurantId, planCode);
  const { error } = await db
    .from('subscriptions')
    .update({ plan_id: plan.id, updated_at: new Date().toISOString() })
    .eq('restaurant_id', restaurantId);
  if (error) return { ok: false as const, error: 'falha ao trocar de plano' };
  return { ok: true as const };
}

/**
 * Registra a cobrança de uma entrega concluída (idempotente por order_id via
 * unique index). Chamado quando o pedido é entregue.
 */
export async function recordDeliveryUsage(db: DB, restaurantId: string, orderId: string) {
  const sub = await ensureSubscription(db, restaurantId);
  const plan = (sub as { plans: Database['public']['Tables']['plans']['Row'] }).plans;
  const now = new Date();
  const { error } = await db.from('billing_events').insert({
    restaurant_id: restaurantId,
    subscription_id: sub.id,
    type: 'delivery_fee',
    amount: Number(plan.per_delivery_price),
    description: `Entrega — ${plan.name}`,
    order_id: orderId,
    period_start: sub.current_period_start,
    period_end: sub.current_period_end,
  });
  // 23505 = já cobrado (idempotência) → ok
  if (error && error.code !== '23505') {
    console.error('[billing] recordDeliveryUsage:', error.message);
  }
  return { ok: true as const };
}

export type UsageSummary = {
  plan: { code: string; name: string; monthlyPrice: number; perDeliveryPrice: number; features: PlanFeatures };
  status: string;
  trialEndsAt: string | null;
  periodStart: string;
  periodEnd: string;
  deliveries: number;
  orders: number;
  monthlyFee: number;
  variableFee: number;
  estimatedTotal: number;
  billedTotal: number;
};

/** Resumo de uso e fatura estimada do período corrente. */
export async function getUsageSummary(db: DB, restaurantId: string): Promise<UsageSummary> {
  const sub = await ensureSubscription(db, restaurantId);
  const plan = (sub as { plans: Database['public']['Tables']['plans']['Row'] }).plans;

  const { count: deliveries } = await db
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('restaurant_id', restaurantId)
    .eq('status', 'delivered')
    .gte('delivered_at', sub.current_period_start)
    .lt('delivered_at', sub.current_period_end);

  const { count: orders } = await db
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('restaurant_id', restaurantId)
    .gte('created_at', sub.current_period_start)
    .lt('created_at', sub.current_period_end);

  const { data: billed } = await db
    .from('billing_events')
    .select('amount')
    .eq('restaurant_id', restaurantId)
    .gte('period_start', sub.current_period_start);

  const d = deliveries ?? 0;
  const monthlyFee = Number(plan.monthly_price);
  const variableFee = round(d * Number(plan.per_delivery_price));
  const billedTotal = round((billed ?? []).reduce((s, b) => s + Number(b.amount), 0) + monthlyFee);

  return {
    plan: {
      code: plan.code,
      name: plan.name,
      monthlyPrice: monthlyFee,
      perDeliveryPrice: Number(plan.per_delivery_price),
      features: (plan.features ?? {}) as PlanFeatures,
    },
    status: sub.status,
    trialEndsAt: sub.trial_ends_at,
    periodStart: sub.current_period_start,
    periodEnd: sub.current_period_end,
    deliveries: d,
    orders: orders ?? 0,
    monthlyFee,
    variableFee,
    estimatedTotal: round(monthlyFee + variableFee),
    billedTotal,
  };
}

/** Features do plano do restaurante — para gating de UI/rotas. */
export async function getPlanFeatures(db: DB, restaurantId: string): Promise<PlanFeatures> {
  const { data } = await db
    .from('subscriptions')
    .select('plans(features)')
    .eq('restaurant_id', restaurantId)
    .maybeSingle();
  const features = (data as { plans?: { features?: PlanFeatures } } | null)?.plans?.features;
  return (features ?? { auto_dispatch: true, map: true, tracking: true, grouping: true, own_fleet: true }) as PlanFeatures;
}

const round = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Gestão de assinatura pelo admin (cobrança é manual, por fora — Pix/boleto)
// ---------------------------------------------------------------------------

export type SubscriptionAction =
  | { action: 'mark_paid' }
  | { action: 'past_due' }
  | { action: 'cancel' }
  | { action: 'extend_trial'; days: number }
  | { action: 'change_plan'; planCode: string };

/** Soma meses mantendo o dia (31/01 + 1 mês = último dia de fevereiro). */
export function addMonths(d: Date, months: number): Date {
  const x = new Date(d);
  const day = x.getUTCDate();
  x.setUTCDate(1);
  x.setUTCMonth(x.getUTCMonth() + months);
  const last = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate();
  x.setUTCDate(Math.min(day, last));
  return x;
}

/**
 * Próximo período pago. Se a assinatura ainda está em dia (vence no futuro),
 * o mês novo emenda no fim do atual; se já venceu (ou estava em teste),
 * começa hoje.
 */
export function nextPaidPeriod(
  current: { status: string; current_period_end: string | null },
  now: Date = new Date(),
): { start: Date; end: Date } {
  const end = current.current_period_end ? new Date(current.current_period_end) : null;
  const start = current.status === 'active' && end && end > now ? end : now;
  return { start, end: addMonths(start, 1) };
}

export async function applySubscriptionAction(
  db: DB,
  restaurantId: string,
  act: SubscriptionAction,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sub = await ensureSubscription(db, restaurantId);
  const now = new Date();
  const nowIso = now.toISOString();

  switch (act.action) {
    case 'mark_paid': {
      const { start, end } = nextPaidPeriod(sub, now);
      const plan = (sub as { plans?: { monthly_price?: number; name?: string } }).plans;
      const { error } = await db
        .from('subscriptions')
        .update({
          status: 'active',
          current_period_start: start.toISOString(),
          current_period_end: end.toISOString(),
          trial_ends_at: null,
          canceled_at: null,
          updated_at: nowIso,
        })
        .eq('id', sub.id);
      if (error) return { ok: false, error: error.message };
      await db.from('billing_events').insert({
        restaurant_id: restaurantId,
        subscription_id: sub.id,
        type: 'subscription_fee',
        amount: Number(plan?.monthly_price ?? 0),
        description: `Mensalidade paga — ${plan?.name ?? 'plano'} até ${end.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
      });
      return { ok: true };
    }
    case 'past_due': {
      const { error } = await db.from('subscriptions').update({ status: 'past_due', updated_at: nowIso }).eq('id', sub.id);
      return error ? { ok: false, error: error.message } : { ok: true };
    }
    case 'cancel': {
      const { error } = await db
        .from('subscriptions')
        .update({ status: 'canceled', canceled_at: nowIso, updated_at: nowIso })
        .eq('id', sub.id);
      return error ? { ok: false, error: error.message } : { ok: true };
    }
    case 'extend_trial': {
      const days = Math.round(act.days);
      if (!Number.isFinite(days) || days < 1 || days > 60) return { ok: false, error: 'informe de 1 a 60 dias' };
      const base = sub.trial_ends_at && new Date(sub.trial_ends_at) > now ? new Date(sub.trial_ends_at) : now;
      const { error } = await db
        .from('subscriptions')
        .update({
          status: 'trialing',
          trial_ends_at: new Date(base.getTime() + days * 864e5).toISOString(),
          canceled_at: null,
          updated_at: nowIso,
        })
        .eq('id', sub.id);
      return error ? { ok: false, error: error.message } : { ok: true };
    }
    case 'change_plan':
      return changePlan(db, restaurantId, act.planCode);
  }
}
