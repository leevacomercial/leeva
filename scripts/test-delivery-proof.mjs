/**
 * Testes da comprovação de entrega (GPS + foto). Fixtures [DP], limpa no fim.
 * Uso: node --import tsx --env-file=apps/restaurante/.env.local scripts/test-delivery-proof.mjs
 * Requer a migration 0033_delivery_proof.sql aplicada.
 */
import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';
import { confirmDeliveryWithProof, DELIVERY_PROXIMITY_M } from '../packages/shared/src/services/index.ts';

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let pass = 0;
let fail = 0;
const cleanup = [];
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

// ~0,001 grau de latitude ≈ 111 m
const DEST = { lat: -7.115, lng: -34.861 };

async function makeOrder(status = 'in_route') {
  const { data: r } = await db
    .from('restaurants')
    .insert({ name: '[DP] R', latitude: DEST.lat, longitude: DEST.lng, fleet_mode: 'own', onboarding_completed: true })
    .select('id')
    .single();
  cleanup.push(() => db.from('restaurants').delete().eq('id', r.id));
  const { data: m } = await db
    .from('motoboys')
    .insert({
      restaurant_id: r.id,
      full_name: '[DP] D',
      phone: `+55839${Math.floor(1000000 + Math.random() * 8999999)}`,
      status: 'on_delivery',
      active: true,
      fleet: 'own',
    })
    .select('id')
    .single();
  cleanup.push(() => db.from('motoboys').delete().eq('id', m.id));
  const { data: o } = await db
    .from('orders')
    .insert({
      restaurant_id: r.id,
      motoboy_id: m.id,
      customer_name: '[DP] C',
      customer_address: 'rua teste',
      latitude: DEST.lat,
      longitude: DEST.lng,
      status,
      order_amount: 0,
      notes: '[DP]',
    })
    .select('id')
    .single();
  cleanup.push(() => db.from('orders').delete().eq('id', o.id));
  return { orderId: o.id, motoboyId: m.id };
}

const run = async () => {
  await t('perto do endereço → confirma (gps ok)', async () => {
    const { orderId, motoboyId } = await makeOrder();
    const res = await confirmDeliveryWithProof(db, {
      orderId,
      motoboyId,
      lat: DEST.lat + 0.0003, // ~33 m
      lng: DEST.lng,
      photoPath: `${orderId}/x.jpg`,
    });
    assert.equal(res.ok, true);
    assert.equal(res.gpsStatus, 'ok');
    assert.ok(res.distanceM <= DELIVERY_PROXIMITY_M);
    const { data: o } = await db.from('orders').select('status, delivery_gps_status').eq('id', orderId).single();
    assert.equal(o.status, 'delivered');
    assert.equal(o.delivery_gps_status, 'ok');
  });

  await t('longe do endereço → BLOQUEIA', async () => {
    const { orderId, motoboyId } = await makeOrder();
    const res = await confirmDeliveryWithProof(db, {
      orderId,
      motoboyId,
      lat: DEST.lat + 0.01, // ~1,1 km
      lng: DEST.lng,
      photoPath: `${orderId}/x.jpg`,
    });
    assert.equal(res.ok, false);
    assert.equal(res.code, 'too_far');
    const { data: o } = await db.from('orders').select('status').eq('id', orderId).single();
    assert.equal(o.status, 'in_route', 'não avança quando longe');
  });

  await t('sem GPS → confirma mas marca no_gps', async () => {
    const { orderId, motoboyId } = await makeOrder();
    const res = await confirmDeliveryWithProof(db, { orderId, motoboyId, photoPath: `${orderId}/x.jpg` });
    assert.equal(res.ok, true);
    assert.equal(res.gpsStatus, 'no_gps');
    const { data: o } = await db.from('orders').select('status, delivery_gps_status').eq('id', orderId).single();
    assert.equal(o.status, 'delivered');
    assert.equal(o.delivery_gps_status, 'no_gps');
  });

  await t('entrega que não é do motoboy → recusa', async () => {
    const { orderId } = await makeOrder();
    const res = await confirmDeliveryWithProof(db, {
      orderId,
      motoboyId: '00000000-0000-0000-0000-000000000000',
      photoPath: 'x',
    });
    assert.equal(res.ok, false);
    assert.equal(res.code, 'invalid_state');
  });

  await t('entrega já concluída → recusa (estado inválido)', async () => {
    const { orderId, motoboyId } = await makeOrder('delivered');
    const res = await confirmDeliveryWithProof(db, { orderId, motoboyId, photoPath: 'x' });
    assert.equal(res.ok, false);
  });
};

run()
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
