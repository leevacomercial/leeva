/**
 * DEMO / DEVELOPMENT ONLY — dados da Fase 3.
 *
 * - completa o onboarding do restaurante demo (fleet hybrid, coords, taxa)
 * - cria assinatura (plano Pro, em trial)
 * - cria ~6 entregadores da equipe própria do restaurante demo
 *   espalhados por João Pessoa, com métricas variadas
 * - converte os motoboys "(demo)" existentes em frota própria
 *
 * Uso: node --import tsx --env-file=apps/restaurante/.env.local scripts/seed-fase3.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { ensureSubscription } from '../packages/shared/src/services/index.ts';

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const RESTAURANT = { lat: -7.1195, lng: -34.8451 };
const REGIONS = [
  { name: 'Manaíra', lat: -7.0952, lng: -34.8372 },
  { name: 'Bessa', lat: -7.0781, lng: -34.8402 },
  { name: 'Tambaú', lat: -7.1083, lng: -34.8331 },
  { name: 'Cabo Branco', lat: -7.1301, lng: -34.7985 },
  { name: 'Bancários', lat: -7.1436, lng: -34.8302 },
  { name: 'Centro', lat: -7.1155, lng: -34.8631 },
];
const jitter = (v) => v + (Math.random() - 0.5) * 0.02;

async function main() {
  const owner = (await db.auth.admin.listUsers({ perPage: 200 })).data.users.find(
    (u) => u.email === 'dono@leeva.dev',
  );
  if (!owner) throw new Error('rode scripts/seed.mjs primeiro');
  const { data: u } = await db.from('users').select('restaurant_id').eq('id', owner.id).single();
  const rid = u.restaurant_id;

  // onboarding + config
  await db
    .from('restaurants')
    .update({
      latitude: RESTAURANT.lat,
      longitude: RESTAURANT.lng,
      fleet_mode: 'hybrid',
      onboarding_completed: true,
      logistics_config: {
        service_radius_km: 10,
        customer_fee: 9.5,
        free_delivery_min_order: null,
        min_order: 0,
        grouping_enabled: true,
        auto_dispatch_enabled: true,
        offer_timeout_seconds: 45,
        max_dispatch_attempts: 4,
      },
    })
    .eq('id', rid);
  console.log('restaurante configurado (hybrid, onboarding ok):', rid);

  // assinatura Pro
  const { data: proPlan } = await db.from('plans').select('id').eq('code', 'pro').single();
  await ensureSubscription(db, rid, 'pro');
  await db.from('subscriptions').update({ plan_id: proPlan.id }).eq('restaurant_id', rid);
  console.log('assinatura: Pro (trial)');

  // motoboys "(demo)" -> frota própria
  await db.from('motoboys').update({ fleet: 'own' }).eq('restaurant_id', rid).ilike('full_name', '%(demo)%');

  // rede Leeva
  const netNames = [
    ['Alan Rede', 5.0, 40, 39, 1, 1.2],
    ['Bruna Rede', 4.8, 60, 57, 4, 3.1],
    ['Caio Rede', 4.6, 25, 22, 5, 6.0],
    ['Dora Rede', 4.9, 80, 78, 3, 2.0],
    ['Elias Rede', 4.3, 12, 10, 2, 8.5],
    ['Flávia Rede', 5.0, 100, 99, 1, 0.8],
  ];
  const { data: existing } = await db.from('motoboys').select('full_name').is('restaurant_id', null);
  const have = new Set((existing ?? []).map((m) => m.full_name));
  for (let i = 0; i < netNames.length; i++) {
    const [name, rating, total, done, late, avgDelay] = netNames[i];
    if (have.has(name)) continue;
    const r = REGIONS[i % REGIONS.length];
    await db.from('motoboys').insert({
      restaurant_id: rid,
      fleet: 'own',
      full_name: name,
      phone: `8391000${2000 + i}`,
      status: i < 5 ? 'available' : 'offline',
      current_latitude: jitter(r.lat),
      current_longitude: jitter(r.lng),
      location_updated_at: new Date().toISOString(),
      max_concurrent_deliveries: 3,
      rating,
      deliveries_total: total,
      deliveries_completed: done,
      deliveries_late: late,
      avg_delay_min: avgDelay,
    });
  }
  const { count } = await db.from('motoboys').select('id', { count: 'exact', head: true }).is('restaurant_id', null);
  console.log('entregadores da rede Leeva:', count);

  // reseta despacho dos pedidos abertos para o motor pegar
  await db
    .from('orders')
    .update({ dispatch_state: 'searching' })
    .eq('restaurant_id', rid)
    .is('motoboy_id', null)
    .in('status', ['waiting_dispatch', 'preparing', 'ready']);

  console.log('\nOK. Login: dono@leeva.dev / leeva123');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
