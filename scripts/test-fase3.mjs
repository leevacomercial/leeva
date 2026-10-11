/**
 * Testes de integração da Fase 3 (Supabase real). Fixtures [F3], limpa no fim.
 *
 * Uso: node --import tsx --env-file=apps/restaurante/.env.local scripts/test-fase3.mjs
 *
 * Cobre: assinatura, cobrança por entrega (idempotente), uso, mudança de
 * plano, despacho automático (oferta), fallback (recusa → próximo),
 * aceite, finanças da logística, heatmap, mapa (não vaza rede),
 * isolamento entre restaurantes.
 */
import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';
import {
  ensureSubscription,
  recordDeliveryUsage,
  getUsageSummary,
  changePlan,
  runDispatchTick,
  acceptOffer,
  declineOffer,
  finalizeLogisticsForOrder,
  getLogisticsFinance,
  getHeatmap,
  getMapData,
  advanceOrderStatus,
} from '../packages/shared/src/services/index.ts';

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); console.log(`  ✓ ${name}`); pass++; }
  catch (e) { console.log(`  ✗ ${name}\n    ${e.message}`); fail++; }
};
const cleanup = [];

async function main() {
  const { data: rA } = await db.from('restaurants').insert({ name: '[F3] A', latitude: -7.11, longitude: -34.84, fleet_mode: 'own', onboarding_completed: true }).select('id').single();
  const { data: rB } = await db.from('restaurants').insert({ name: '[F3] B', fleet_mode: 'own', onboarding_completed: true }).select('id').single();
  cleanup.push(() => db.from('restaurants').delete().in('id', [rA.id, rB.id]));

  // equipe própria do restaurante A
  const net = [];
  for (const [n, lat, lng, rating] of [['[F3] N1', -7.111, -34.841, 5], ['[F3] N2', -7.13, -34.80, 4.5], ['[F3] N3', -7.09, -34.83, 4.9]]) {
    const { data } = await db.from('motoboys').insert({ restaurant_id: rA.id, fleet: 'own', full_name: n, phone: `f3${Math.random()}`.slice(0, 15), status: 'available', current_latitude: lat, current_longitude: lng, location_updated_at: new Date().toISOString(), rating, deliveries_total: 20, deliveries_completed: 19, deliveries_late: 1, terms_accepted_version: 1 }).select('id, full_name').single();
    net.push(data);
    cleanup.push(() => db.from('motoboys').delete().eq('id', data.id));
  }

  const mkOrder = async (rid = rA.id, extra = {}) => (await db.from('orders').insert({
    restaurant_id: rid, customer_name: 'C', customer_address: 'Rua - Bessa', latitude: -7.108, longitude: -34.835,
    order_amount: 40, delivery_fee: 9.5, status: 'ready', dispatch_state: 'searching', notes: '[F3]', ...extra,
  }).select('id, order_number').single()).data;

  // ---- BILLING ----
  await t('assinatura: criada em trial no plano start', async () => {
    const sub = await ensureSubscription(db, rA.id);
    assert.ok(sub?.id);
    assert.equal(sub.status, 'trialing');
  });

  await t('assinatura: idempotente (não cria duas)', async () => {
    const a = await ensureSubscription(db, rA.id);
    const b = await ensureSubscription(db, rA.id);
    assert.equal(a.id, b.id);
    const { count } = await db.from('subscriptions').select('id', { count: 'exact', head: true }).eq('restaurant_id', rA.id);
    assert.equal(count, 1);
  });

  await t('mudança de plano', async () => {
    const r = await changePlan(db, rA.id, 'pro');
    assert.equal(r.ok, true);
    const s = await getUsageSummary(db, rA.id);
    assert.equal(s.plan.code, 'pro');
  });

  let billedOrder;
  await t('cobrança por entrega: registrada uma vez (idempotente)', async () => {
    const o = await mkOrder();
    billedOrder = o.id;
    await recordDeliveryUsage(db, rA.id, o.id);
    await recordDeliveryUsage(db, rA.id, o.id); // repete
    const { count } = await db.from('billing_events').select('id', { count: 'exact', head: true }).eq('order_id', o.id).eq('type', 'delivery_fee');
    assert.equal(count, 1);
  });

  await t('uso: soma entregas e estima total', async () => {
    // marca o pedido cobrado como entregue neste período
    await db.from('orders').update({ status: 'delivered', delivered_at: new Date().toISOString() }).eq('id', billedOrder);
    const s = await getUsageSummary(db, rA.id);
    assert.ok(s.deliveries >= 1);
    assert.ok(s.estimatedTotal >= s.monthlyFee);
    assert.equal(s.variableFee, Math.round(s.deliveries * s.plan.perDeliveryPrice * 100) / 100);
  });

  // ---- DESPACHO AUTOMÁTICO ----
  let offerOrderId, offerId, offeredMotoboy;
  await t('despacho automático: cria uma oferta para o melhor entregador', async () => {
    const o = await mkOrder();
    offerOrderId = o.id;
    const res = await runDispatchTick(db, rA.id);
    assert.ok(res.offered >= 1, JSON.stringify(res));
    const { data: att } = await db.from('dispatch_attempts').select('id, motoboy_id, score').eq('order_id', o.id).is('responded_at', null).single();
    offerId = att.id;
    offeredMotoboy = att.motoboy_id;
    assert.ok(net.map((n) => n.id).includes(att.motoboy_id));
    assert.ok(Number(att.score) > 0);
    const { data: ord } = await db.from('orders').select('dispatch_state, motoboy_id').eq('id', o.id).single();
    assert.equal(ord.dispatch_state, 'offered');
    assert.equal(ord.motoboy_id, null); // ainda não atribuído
  });

  await t('despacho: não cria segunda oferta enquanto a primeira está aberta', async () => {
    const res = await runDispatchTick(db, rA.id);
    const { count } = await db.from('dispatch_attempts').select('id', { count: 'exact', head: true }).eq('order_id', offerOrderId).is('responded_at', null);
    assert.equal(count, 1);
    void res;
  });

  await t('fallback: ao recusar, o pedido volta a buscar e vai para outro entregador', async () => {
    const dec = await declineOffer(db, offerId, offeredMotoboy, 'ocupado');
    assert.equal(dec.ok, true);
    const res = await runDispatchTick(db, rA.id);
    assert.ok(res.offered >= 1, JSON.stringify(res));
    const { data: att2 } = await db.from('dispatch_attempts').select('motoboy_id, attempt_number').eq('order_id', offerOrderId).is('responded_at', null).single();
    assert.notEqual(att2.motoboy_id, offeredMotoboy, 'ofertou para o mesmo que recusou');
    assert.ok(att2.attempt_number >= 2);
    offerId = (await db.from('dispatch_attempts').select('id').eq('order_id', offerOrderId).is('responded_at', null).single()).data.id;
  });

  await t('aceite: atribui o pedido, calcula payout/margem, motoboy fica on_delivery', async () => {
    const { data: att } = await db.from('dispatch_attempts').select('id, motoboy_id').eq('order_id', offerOrderId).is('responded_at', null).single();
    const acc = await acceptOffer(db, att.id, att.motoboy_id);
    assert.equal(acc.ok, true);
    const { data: ord } = await db.from('orders').select('motoboy_id, status, dispatch_state, driver_payout, leeva_fee, logistics_margin').eq('id', offerOrderId).single();
    assert.equal(ord.motoboy_id, att.motoboy_id);
    assert.equal(ord.status, 'assigned');
    assert.equal(ord.dispatch_state, 'assigned');
    assert.ok(Number(ord.driver_payout) > 0, 'sem payout');
    assert.ok(Number(ord.leeva_fee) > 0, 'sem taxa');
    assert.equal(Math.round((Number(ord.leeva_fee) - Number(ord.driver_payout)) * 100) / 100, Number(ord.logistics_margin));
    const { data: m } = await db.from('motoboys').select('status').eq('id', att.motoboy_id).single();
    assert.equal(m.status, 'on_delivery');
  });

  await t('sem entregador: esgotadas as tentativas → dispatch_state failed + alerta', async () => {
    // um restaurante sem rede alcançável: coloca um pedido muito longe
    const o = await mkOrder(rA.id, { latitude: 10, longitude: 10, customer_address: 'Longe - X' });
    await db.from('orders').update({ dispatch_attempts: 4 }).eq('id', o.id);
    const res = await runDispatchTick(db, rA.id);
    void res;
    const { data: ord } = await db.from('orders').select('dispatch_state').eq('id', o.id).single();
    assert.equal(ord.dispatch_state, 'failed');
    const { count } = await db.from('alerts').select('id', { count: 'exact', head: true }).eq('restaurant_id', rA.id).eq('type', 'no_driver').eq('active', true);
    assert.ok(count >= 1);
  });

  // ---- FINANCEIRO ----
  await t('finanças da logística: agrega margem das entregas concluídas', async () => {
    const o = await mkOrder(rA.id);
    await db.from('orders').update({ motoboy_id: net[0].id }).eq('id', o.id);
    await finalizeLogisticsForOrder(db, o.id, rA.id);
    await advanceOrderStatus(db, o.id, 'assigned', { actorType: 'system' });
    await advanceOrderStatus(db, o.id, 'picked_up', { actorType: 'motoboy' });
    await advanceOrderStatus(db, o.id, 'in_route', { actorType: 'motoboy' });
    await advanceOrderStatus(db, o.id, 'delivered', { actorType: 'motoboy' });
    const fin = await getLogisticsFinance(db, rA.id, '30d');
    assert.ok(fin.deliveries >= 1);
    assert.ok(fin.revenue > 0 && fin.driverCost > 0);
    assert.equal(Math.round((fin.revenue - fin.driverCost) * 100) / 100, fin.margin);
  });

  // ---- HEATMAP / MAPA ----
  await t('heatmap: pontos e regiões vêm dos pedidos reais', async () => {
    const h = await getHeatmap(db, rA.id, '30d');
    assert.ok(h.total >= 1);
    assert.ok(h.regions.length >= 1);
    assert.ok(Array.isArray(h.insights));
  });

  await t('mapa do restaurante: NÃO expõe a rede de entregadores', async () => {
    const map = await getMapData(db, rA.id);
    const json = JSON.stringify(map);
    // nenhum nome/tel.: só primeiro nome do entregador de pedidos EM ROTA deste restaurante
    for (const n of net) {
      // o nome completo da rede nunca aparece
      assert.ok(!json.includes(n.full_name), `vazou ${n.full_name}`);
    }
    assert.ok(!/phone|telefone/i.test(json));
  });

  // ---- ISOLAMENTO ----
  await t('isolamento: assinatura/billing/dispatch de A não aparecem para B', async () => {
    const { count: subB } = await db.from('subscriptions').select('id', { count: 'exact', head: true }).eq('restaurant_id', rB.id);
    // B só ganha assinatura quando ensureSubscription é chamado — aqui não foi
    void subB;
    const { count: billB } = await db.from('billing_events').select('id', { count: 'exact', head: true }).eq('restaurant_id', rB.id);
    assert.equal(billB, 0);
    const { count: dispB } = await db.from('dispatch_attempts').select('id', { count: 'exact', head: true }).eq('restaurant_id', rB.id);
    assert.equal(dispB, 0);
    const finB = await getLogisticsFinance(db, rB.id, '30d');
    assert.equal(finB.deliveries, 0);
  });
}

main().catch((e) => { console.error(e); fail++; }).finally(async () => {
  for (const c of cleanup.reverse()) { try { await c(); } catch {} }
  console.log(`\n${pass} passaram, ${fail} falharam`);
  process.exit(fail ? 1 : 0);
});
