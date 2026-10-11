/**
 * Testes de integração contra o Supabase real (usa a service_role key).
 * Cria dados com prefixo [ITEST], testa e limpa no final.
 *
 * Uso:  node --env-file=apps/restaurante/.env.local scripts/test-integration.mjs
 *
 * Cobre: criação/normalização, idempotência (source+external_id),
 * máquina de estados, geração e segurança do token de tracking,
 * isolamento multi-tenant, webhook (assinatura inválida).
 */
import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';
import {
  createOrderFromNormalized,
  advanceOrderStatus,
  assignDriver,
  recommendDriver,
  getPublicTrackingSnapshot,
  ensureTrackingToken,
  estimateOrderEta,
  suggestGroups,
  haversineKm,
} from '../packages/shared/src/services/index.ts';
import { getOrderProvider } from '../packages/shared/src/integrations/registry.ts';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('env ausente');
const db = createClient(url, key, { auth: { persistSession: false } });

let pass = 0;
let fail = 0;
const t = async (name, fn) => {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    pass++;
  } catch (e) {
    console.log(`  ✗ ${name}\n    ${e.message}`);
    fail++;
  }
};

const cleanup = [];

async function main() {
  // --- fixtures: 2 restaurantes ---
  const { data: rA } = await db.from('restaurants').insert({ name: '[ITEST] Rest A', latitude: -7.11, longitude: -34.84 }).select('id').single();
  const { data: rB } = await db.from('restaurants').insert({ name: '[ITEST] Rest B' }).select('id').single();
  cleanup.push(() => db.from('restaurants').delete().in('id', [rA.id, rB.id]));

  const { data: mA } = await db.from('motoboys').insert({
    restaurant_id: rA.id, full_name: '[ITEST] Moto A', phone: '0001',
    status: 'available', current_latitude: -7.111, current_longitude: -34.841,
    terms_accepted_version: 1,
  }).select('id').single();

  const manual = getOrderProvider('manual');
  const parsed = await manual.parse({
    customerName: 'ITEST Cliente', address: 'Rua T, 1 - Centro',
    latitude: -7.1, longitude: -34.83,
    items: [{ name: 'Item', quantity: 1, unitPrice: 10 }], deliveryFee: 5,
  });
  assert.ok(parsed.ok);

  await t('cria pedido a partir de NormalizedOrder', async () => {
    const r = await createOrderFromNormalized(db, rA.id, parsed.order);
    assert.equal(r.ok, true);
    assert.equal(r.duplicate, false);
    assert.ok(r.orderNumber >= 1);
  });

  await t('idempotência: mesmo source+external_id não duplica', async () => {
    const ext = { ...parsed.order, externalId: 'EXT-123', source: 'ifood' };
    const a = await createOrderFromNormalized(db, rA.id, ext);
    const b = await createOrderFromNormalized(db, rA.id, ext);
    assert.equal(a.ok && b.ok, true);
    assert.equal(a.orderId, b.orderId);
    assert.equal(b.duplicate, true);
  });

  let orderId;
  await t('máquina de estados: transição inválida é bloqueada', async () => {
    const { data: o } = await db.from('orders').insert({
      restaurant_id: rA.id, customer_name: 'X', customer_address: 'Rua Y - Centro',
      latitude: -7.1, longitude: -34.83, order_amount: 10, delivery_fee: 5, status: 'waiting_dispatch',
    }).select('id').single();
    orderId = o.id;
    const bad = await advanceOrderStatus(db, orderId, 'delivered', { actorType: 'restaurant' });
    assert.equal(bad.ok, false);
    const ok = await advanceOrderStatus(db, orderId, 'preparing', { actorType: 'restaurant' });
    assert.equal(ok.ok, true);
  });

  await t('recommendDriver: pontua e explica com base em dados reais', async () => {
    const rec = await recommendDriver(db, orderId);
    assert.ok(rec.recommended);
    assert.equal(rec.recommended.name, '[ITEST] Moto A');
    assert.ok(rec.recommended.score > 0);
    assert.ok(rec.recommended.reasons.some((r) => /dispon/i.test(r)));
    assert.ok(rec.recommended.reasons.some((r) => /km da coleta/i.test(r)));
  });

  await t('assignDriver + timeline sem eventos duplicados', async () => {
    const r = await assignDriver(db, orderId, mA.id, {});
    assert.equal(r.ok, true);
    const { data: evs } = await db.from('order_events').select('type').eq('order_id', orderId).order('created_at');
    const types = evs.map((e) => e.type);
    // cada tipo aparece no máximo 1x
    assert.equal(new Set(types).size, types.length, `duplicados: ${types}`);
    assert.ok(types.includes('delivery.assigned'));
  });

  let token;
  await t('tracking: token seguro (hex longo) e snapshot enxuto', async () => {
    token = await ensureTrackingToken(db, orderId);
    assert.ok(token && /^[0-9a-f]{40,}$/.test(token), `token: ${token}`);
    const snap = await getPublicTrackingSnapshot(db, token);
    assert.equal(snap.ok, true);
    const keys = Object.keys(snap.snapshot);
    // não vaza id interno, custo, telefone do motoboy
    assert.ok(!keys.includes('id'));
    assert.ok(!JSON.stringify(snap.snapshot).includes(rA.id));
    assert.ok(snap.snapshot.restaurantName.includes('ITEST'));
  });

  await t('tracking: token inexistente = 404', async () => {
    const snap = await getPublicTrackingSnapshot(db, 'nao-existe');
    assert.equal(snap.ok, false);
    assert.equal(snap.code, 404);
  });

  await t('multi-tenant: pedido do Rest A não aparece filtrando por Rest B', async () => {
    const { data: bOrders } = await db.from('orders').select('id').eq('restaurant_id', rB.id);
    assert.equal(bOrders.length, 0);
    const { count } = await db.from('orders').select('id', { count: 'exact', head: true }).eq('restaurant_id', rA.id);
    assert.ok(count >= 3);
  });

  await t('webhook iFood: assinatura inválida é recusada', async () => {
    const provider = getOrderProvider('ifood');
    const ok = await provider.verifyWebhook({ headers: { 'x-ifood-signature': 'errada' }, rawBody: '{}' });
    assert.equal(ok, false); // PREPARADO: sem IFOOD_WEBHOOK_SECRET, recusa tudo
  });

  await t('ETA: coordenada absurda não gera minutos absurdos', async () => {
    const { data: o } = await db.from('orders').insert({
      restaurant_id: rA.id, customer_name: 'Longe', customer_address: 'Rua X - Y',
      latitude: -33.87, longitude: 151.21, // Sydney — do outro lado do mundo
      order_amount: 10, delivery_fee: 5, status: 'assigned', motoboy_id: mA.id,
    }).select('id').single();
    await db.from('motoboys').update({ current_latitude: -7.11, current_longitude: -34.84, location_updated_at: new Date().toISOString() }).eq('id', mA.id);
    const eta = await estimateOrderEta(db, o.id);
    // ou devolve null (não dá pra calcular), ou um intervalo sensato (< 3h)
    assert.ok(eta === null || eta.maxMinutes <= 180, `eta=${JSON.stringify(eta)}`);
  });

  await t('ETA: intervalo sempre tem min < max e min >= 3', async () => {
    const { data: o } = await db.from('orders').insert({
      restaurant_id: rA.id, customer_name: 'Perto', customer_address: 'Rua Z - Centro',
      latitude: -7.1, longitude: -34.83, order_amount: 10, delivery_fee: 5, status: 'in_route', motoboy_id: mA.id,
    }).select('id').single();
    const eta = await estimateOrderEta(db, o.id);
    if (eta) {
      assert.ok(eta.minMinutes >= 3 && eta.maxMinutes > eta.minMinutes, JSON.stringify(eta));
    }
  });

  await t('agrupamento: não junta pedidos distantes (sentidos opostos)', async () => {
    const far = [
      { lat: -7.05, lng: -34.80 }, { lat: -7.05, lng: -34.802 }, // par norte
      { lat: -7.20, lng: -34.90 }, { lat: -7.20, lng: -34.902 }, // par sul (longe)
    ];
    for (const p of far) {
      await db.from('orders').insert({
        restaurant_id: rA.id, customer_name: 'G', customer_address: 'Rua G - Bairro',
        latitude: p.lat, longitude: p.lng, order_amount: 10, delivery_fee: 5, status: 'ready',
      });
    }
    const s = await suggestGroups(db, rA.id);
    for (const g of s.groups) {
      // nenhum grupo deve ter dois destinos a mais de ~5 km
      for (let i = 0; i < g.orders.length; i++)
        for (let j = i + 1; j < g.orders.length; j++)
          assert.ok((haversineKm(g.orders[i], g.orders[j]) ?? 0) < 5, `grupo espalhado: ${g.spreadKm} km`);
      assert.ok(g.orders.length <= 4, `grupo grande demais: ${g.orders.length}`);
    }
  });

  await t('notificação do cliente: não duplica (mesmo pedido + template)', async () => {
    const { data: o } = await db.from('orders').insert({
      restaurant_id: rA.id, customer_name: 'N', customer_phone: '5583900000000',
      customer_address: 'Rua N - Centro', latitude: -7.1, longitude: -34.83,
      order_amount: 10, delivery_fee: 5, status: 'ready', motoboy_id: mA.id,
    }).select('id').single();
    await advanceOrderStatus(db, o.id, 'assigned', { actorType: 'restaurant' });
    await advanceOrderStatus(db, o.id, 'picked_up', { actorType: 'motoboy' });
    await advanceOrderStatus(db, o.id, 'in_route', { actorType: 'motoboy' });
    await advanceOrderStatus(db, o.id, 'in_route', { actorType: 'motoboy' }); // repete
    const { count } = await db.from('notifications').select('id', { count: 'exact', head: true })
      .eq('order_id', o.id).eq('template', 'customer.out_for_delivery').eq('recipient_type', 'customer');
    assert.equal(count, 1, `notificações: ${count}`);
  });

  await t('tracking: pedido cancelado mostra cancelado (não "entregue")', async () => {
    const { data: o } = await db.from('orders').insert({
      restaurant_id: rA.id, customer_name: 'Cancel', customer_address: 'Rua C - Centro',
      latitude: -7.1, longitude: -34.83, order_amount: 10, delivery_fee: 5, status: 'ready',
    }).select('id').single();
    await advanceOrderStatus(db, o.id, 'cancelled', { actorType: 'restaurant' });
    const tk = await ensureTrackingToken(db, o.id);
    const snap = await getPublicTrackingSnapshot(db, tk);
    assert.equal(snap.ok, true);
    assert.equal(snap.snapshot.cancelled, true);
    assert.equal(snap.snapshot.delivered, false);
    assert.ok(snap.snapshot.steps.every((s) => !s.done), 'passos não devem estar "done"');
  });
}

main()
  .catch((e) => {
    console.error(e);
    fail++;
  })
  .finally(async () => {
    for (const c of cleanup.reverse()) {
      try {
        await c();
      } catch {
        /* ignora */
      }
    }
    console.log(`\n${pass} passaram, ${fail} falharam`);
    process.exit(fail ? 1 : 0);
  });
