/**
 * Testes de regressão — validação de endereço antes de criar pedido / tarifa.
 *
 * Bug original: um pedido com endereço claramente inválido
 * ("rua aaaaa, número aaaaa") era criado assim mesmo, com tarifa calculada e
 * oferta enviada ao motoboy, porque nada checava se o endereço existe.
 *
 * Aqui o geocoder é FALSO (injetado via __setMapProvider) para o teste não
 * depender de rede: ele "não encontra" endereços com 'aaaa', "cai" para
 * endereços com 'TIMEOUT', e localiza o resto perto do restaurante.
 *
 * Uso: node --import tsx --env-file=apps/restaurante/.env.local scripts/test-address.mjs
 */
import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';
import {
  __setMapProvider,
  GeocoderUnavailableError,
  resolveDeliveryLocation,
  resolvePickupLocation,
  createOrderFromNormalized,
  ensureSubscription,
  changePlan,
} from '../packages/shared/src/services/index.ts';
import { getOrderProvider } from '../packages/shared/src/integrations/index.ts';

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let pass = 0,
  fail = 0;
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

// ---- geocoder falso, determinístico ----
const REST = { latitude: -7.115, longitude: -34.845 };
const fakeProvider = {
  name: 'fake',
  tileUrl: '',
  tileAttribution: '',
  async geocode(address) {
    const a = String(address).toLowerCase();
    if (a.includes('timeout')) throw new GeocoderUnavailableError('timeout simulado');
    if (a.includes('aaaa') || a.includes('inexistente')) return null; // não encontrado
    if (a.includes('longe')) {
      // devolve um "match" ruim, longe demais para ser real (outro estado)
      return { latitude: -23.55, longitude: -46.63, label: 'São Paulo, SP', source: 'fake', precision: 'street', score: 0.3 };
    }
    if (a.includes('cidade')) {
      // match fraco: só nível cidade/região
      return { latitude: -7.12, longitude: -34.86, label: 'João Pessoa, PB', source: 'fake', precision: 'area', score: 0.4 };
    }
    // endereço plausível, perto do restaurante
    return { latitude: -7.108, longitude: -34.84, label: `${address} — João Pessoa, PB`, source: 'fake', precision: 'street', score: 0.7 };
  },
};

async function main() {
  __setMapProvider(fakeProvider);

  const { data: r } = await db
    .from('restaurants')
    .insert({ name: '[ADDR] R', latitude: REST.latitude, longitude: REST.longitude, fleet_mode: 'own', onboarding_completed: true })
    .select('id')
    .single();
  cleanup.push(() => db.from('restaurants').delete().eq('id', r.id));
  cleanup.push(() => db.from('orders').delete().eq('restaurant_id', r.id));
  await ensureSubscription(db, r.id, 'pro');
  await changePlan(db, r.id, 'pro');

  const manual = getOrderProvider('manual');
  const mkNormalized = async (address, extra = {}) => {
    const parsed = await manual.parse({ customerName: 'Cliente ADDR', address, items: [], ...extra });
    assert.ok(parsed.ok, parsed.error);
    return parsed.order;
  };
  const orderCount = async () => {
    const { count } = await db.from('orders').select('id', { count: 'exact', head: true }).eq('restaurant_id', r.id);
    return count ?? 0;
  };

  // ===================================================================
  await t('BUG: endereço inválido ("rua aaaaa, número aaaaa") → não localiza', async () => {
    const loc = await resolveDeliveryLocation(db, r.id, { address: 'rua aaaaa, número aaaaa' });
    assert.equal(loc.ok, false);
    assert.equal(loc.reason, 'address_not_found');
  });

  await t('BUG: endereço inválido não cria pedido nem tarifa', async () => {
    const before = await orderCount();
    // simula o caminho da rota: resolve o endereço primeiro
    const loc = await resolveDeliveryLocation(db, r.id, { address: 'rua aaaaa 999, bairro inexistente' });
    assert.equal(loc.ok, false, 'endereço inválido deveria ser rejeitado');
    // e mesmo se pular a rota e for direto no serviço, sem coordenada não passa
    const res = await createOrderFromNormalized(db, r.id, await mkNormalized('rua aaaaa 999, bairro inexistente'));
    assert.equal(res.ok, false, 'pedido sem localização não pode ser criado');
    assert.equal(res.code, 'address_not_found');
    assert.equal(await orderCount(), before, 'nenhum pedido foi criado');
  });

  await t('match ruim (longe demais do restaurante) é tratado como não encontrado', async () => {
    const loc = await resolveDeliveryLocation(db, r.id, { address: 'rua longe, 1' });
    assert.equal(loc.ok, false);
    assert.equal(loc.reason, 'address_not_found');
  });

  await t('match fraco (só nível cidade) é tratado como não encontrado', async () => {
    const loc = await resolveDeliveryLocation(db, r.id, { address: 'cidade sem rua' });
    assert.equal(loc.ok, false);
    assert.equal(loc.reason, 'address_not_found');
  });

  await t('endereço válido → localiza e devolve a coordenada geocodificada', async () => {
    const loc = await resolveDeliveryLocation(db, r.id, { address: 'Av. Epitácio Pessoa, 1200' });
    assert.equal(loc.ok, true);
    assert.equal(loc.via, 'geocode');
    assert.equal(loc.latitude, -7.108);
    assert.equal(loc.longitude, -34.84);
  });

  await t('endereço válido → pedido criado com a coordenada do geocoder e tarifa > 0', async () => {
    const before = await orderCount();
    const n = await mkNormalized('Av. Epitácio Pessoa, 1200');
    const loc = await resolveDeliveryLocation(db, r.id, { address: n.address.formatted });
    assert.ok(loc.ok);
    n.address.latitude = loc.latitude;
    n.address.longitude = loc.longitude;
    const res = await createOrderFromNormalized(db, r.id, n, {});
    assert.ok(res.ok, res.error);
    cleanup.push(() => db.from('orders').delete().eq('id', res.orderId));
    assert.equal(await orderCount(), before + 1);
    const { data: o } = await db
      .from('orders')
      .select('latitude, longitude, driver_payout, route_distance_km')
      .eq('id', res.orderId)
      .single();
    assert.equal(Number(o.latitude), -7.108);
    assert.ok(o.driver_payout != null && Number(o.driver_payout) > 0, 'tarifa não calculada');
    assert.ok(o.route_distance_km != null && Number(o.route_distance_km) > 0, 'distância não calculada');
  });

  await t('geocoder instável + sem confirmação → geocoder_unavailable (não bloqueia à toa)', async () => {
    const loc = await resolveDeliveryLocation(db, r.id, { address: 'rua TIMEOUT, 10' });
    assert.equal(loc.ok, false);
    assert.equal(loc.reason, 'geocoder_unavailable');
  });

  await t('geocoder instável + coordenada confirmada e plausível → aceita', async () => {
    const loc = await resolveDeliveryLocation(db, r.id, {
      address: 'rua TIMEOUT, 10',
      latitude: -7.11,
      longitude: -34.85,
      confirmed: true,
    });
    assert.equal(loc.ok, true);
    assert.equal(loc.via, 'confirmed');
  });

  await t('geocoder instável + coordenada confirmada mas absurda (outro estado) → recusa', async () => {
    const loc = await resolveDeliveryLocation(db, r.id, {
      address: 'rua TIMEOUT, 10',
      latitude: -23.55,
      longitude: -46.63,
      confirmed: true,
    });
    assert.equal(loc.ok, false);
    assert.equal(loc.reason, 'geocoder_unavailable');
  });

  await t('endereço de COLETA inválido também é rejeitado (onboarding)', async () => {
    const bad = await resolvePickupLocation({ address: 'rua aaaaa sem number' });
    assert.equal(bad.ok, false);
    assert.equal(bad.reason, 'address_not_found');
    const ok = await resolvePickupLocation({ address: 'Rua Real, 100 - Centro' });
    assert.equal(ok.ok, true);
  });

  await t('rascunho (requireConfirmation) pode nascer sem coordenada', async () => {
    const res = await createOrderFromNormalized(
      db,
      r.id,
      await mkNormalized('rua a confirmar'),
      { requireConfirmation: true },
    );
    assert.ok(res.ok, res.error);
    cleanup.push(() => db.from('orders').delete().eq('id', res.orderId));
    const { data: o } = await db.from('orders').select('dispatch_state, latitude').eq('id', res.orderId).single();
    assert.equal(o.latitude, null);
    assert.notEqual(o.dispatch_state, 'searching', 'rascunho não deve entrar em despacho');
  });
}

main()
  .then(async () => {
    for (const c of cleanup.reverse()) await Promise.resolve(c()).catch(() => {});
    __setMapProvider(null);
    console.log(`\n${pass} passaram, ${fail} falharam`);
    process.exit(fail ? 1 : 0);
  })
  .catch(async (e) => {
    console.error(e);
    for (const c of cleanup.reverse()) await Promise.resolve(c()).catch(() => {});
    __setMapProvider(null);
    process.exit(1);
  });
