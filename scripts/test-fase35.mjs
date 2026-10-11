/**
 * Testes de integração da Fase 3.5 (Supabase real). Fixtures [F35], limpa no fim.
 *
 * Uso: node --import tsx --env-file=apps/restaurante/.env.local scripts/test-fase35.mjs
 *
 * Cobre: qualidade da oferta, aceitação justa (recusa de oferta poor não
 * penaliza), incidentes com origem, índice de confiabilidade, bloqueio de
 * entregador, lease/concorrência do cron, rate limiting, chaves de API,
 * visão geral do admin, permissões.
 */
import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';
import {
  classifyOfferQuality,
  computeReliabilityIndex,
  recordIncident,
  dispatchTick,
  runDispatchTick,
  acceptOffer,
  declineOffer,
  advanceOrderStatus,
  checkRateLimit,
  issueApiKey,
  resolveApiKey,
  revokeApiKey,
  listApiKeys,
  getAdminOverview,
  getAdminFinance,
  listDrivers,
  scoreCandidatesForOrder,
} from '../packages/shared/src/services/index.ts';

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

async function main() {
  // ---------------------------------------------------------------
  // 1. QUALIDADE DA OFERTA (função pura)
  // ---------------------------------------------------------------
  await t('qualidade: oferta boa (bom valor, trajeto curto) → excellent/good', () => {
    const q = classifyOfferQuality({
      payout: 12,
      distancePickupKm: 1.2,
      distanceDropoffKm: 2.5,
      etaTotalMin: 22,
      routeFits: true,
    });
    assert.ok(['excellent', 'good'].includes(q.quality), `veio ${q.quality}`);
    assert.equal(q.countsForAcceptance, true);
  });

  await t('qualidade: oferta economicamente ruim (7km deadhead + R$7,50) → poor', () => {
    const q = classifyOfferQuality({
      payout: 7.5,
      distancePickupKm: 7,
      distanceDropoffKm: 4,
      etaTotalMin: 55,
    });
    assert.equal(q.quality, 'poor', `veio ${q.quality} (score ${q.score})`);
    assert.equal(q.countsForAcceptance, false);
  });

  await t('qualidade: recusar oferta poor NUNCA conta para aceitação', () => {
    for (const payout of [6, 7, 7.5]) {
      const q = classifyOfferQuality({ payout, distancePickupKm: 8, distanceDropoffKm: 5, etaTotalMin: 70 });
      assert.equal(q.countsForAcceptance, false);
    }
  });

  // ---------------------------------------------------------------
  // fixtures
  // ---------------------------------------------------------------
  const { data: r } = await db
    .from('restaurants')
    .insert({ name: '[F35] R', latitude: -7.115, longitude: -34.845, fleet_mode: 'own', onboarding_completed: true })
    .select('id')
    .single();
  cleanup.push(() => db.from('restaurants').delete().eq('id', r.id));

  const mkDriver = async (extra = {}) => {
    const { data } = await db
      .from('motoboys')
      .insert({
        restaurant_id: r.id,
        fleet: 'own',
        full_name: '[F35] D',
        phone: `f35${Math.random()}`.slice(0, 15),
        status: 'available',
        current_latitude: -7.114,
        current_longitude: -34.844,
        location_updated_at: new Date().toISOString(),
        rating: 4.8,
        deliveries_total: 30,
        deliveries_completed: 29,
        deliveries_late: 1,
        terms_accepted_version: 1,
        ...extra,
      })
      .select('*')
      .single();
    cleanup.push(() => db.from('motoboys').delete().eq('id', data.id));
    return data;
  };

  const mkOrder = async (extra = {}) => {
    const { data } = await db
      .from('orders')
      .insert({
        restaurant_id: r.id,
        customer_name: 'C',
        customer_address: 'Rua X - Bessa',
        latitude: -7.108,
        longitude: -34.836,
        order_amount: 45,
        delivery_fee: 9.5,
        status: 'ready',
        dispatch_state: 'searching',
        notes: '[F35]',
        ...extra,
      })
      .select('id, order_number')
      .single();
    cleanup.push(() => db.from('orders').delete().eq('id', data.id));
    return data;
  };

  // ---------------------------------------------------------------
  // 2. despacho grava a qualidade da oferta
  // ---------------------------------------------------------------
  await t('despacho: a oferta criada carrega quality + counts_for_acceptance', async () => {
    await mkDriver();
    const o = await mkOrder();
    await runDispatchTick(db, r.id);
    const { data: att } = await db
      .from('dispatch_attempts')
      .select('quality, quality_score, counts_for_acceptance, payout_estimate')
      .eq('order_id', o.id)
      .maybeSingle();
    assert.ok(att, 'nenhuma oferta criada');
    assert.ok(['excellent', 'good', 'acceptable', 'poor'].includes(att.quality));
    assert.equal(typeof att.counts_for_acceptance, 'boolean');
  });

  // ---------------------------------------------------------------
  // 3+4. aceitação justa: recusa de oferta poor vs adequada
  // ---------------------------------------------------------------
  await t('aceitação justa: recusar oferta POOR não mexe em offers_adequate', async () => {
    const d = await mkDriver();
    const o = await mkOrder();
    const { data: att } = await db
      .from('dispatch_attempts')
      .insert({
        restaurant_id: r.id,
        order_id: o.id,
        motoboy_id: d.id,
        attempt_number: 1,
        quality: 'poor',
        counts_for_acceptance: false,
        expires_at: new Date(Date.now() + 60000).toISOString(),
      })
      .select('id')
      .single();
    await declineOffer(db, att.id, d.id, 'valor baixo');
    const { data: after } = await db.from('motoboys').select('offers_adequate').eq('id', d.id).single();
    assert.equal(after.offers_adequate, 0);
    const { count } = await db
      .from('driver_incidents')
      .select('id', { count: 'exact', head: true })
      .eq('motoboy_id', d.id)
      .eq('type', 'decline_adequate_offer');
    assert.equal(count, 0, 'não deveria ter incidente');
  });

  await t('aceitação: recusar oferta GOOD conta em offers_adequate + gera incidente', async () => {
    const d = await mkDriver();
    const o = await mkOrder();
    const { data: att } = await db
      .from('dispatch_attempts')
      .insert({
        restaurant_id: r.id,
        order_id: o.id,
        motoboy_id: d.id,
        attempt_number: 1,
        quality: 'good',
        counts_for_acceptance: true,
        expires_at: new Date(Date.now() + 60000).toISOString(),
      })
      .select('id')
      .single();
    await declineOffer(db, att.id, d.id, 'não quero');
    const { data: after } = await db.from('motoboys').select('offers_adequate, offers_adequate_accepted').eq('id', d.id).single();
    assert.equal(after.offers_adequate, 1);
    assert.equal(after.offers_adequate_accepted, 0);
    const { count } = await db
      .from('driver_incidents')
      .select('id', { count: 'exact', head: true })
      .eq('motoboy_id', d.id)
      .eq('type', 'decline_adequate_offer');
    assert.equal(count, 1);
  });

  await t('aceitação: aceitar oferta GOOD conta como adequada aceita', async () => {
    const d = await mkDriver();
    const o = await mkOrder();
    const { data: att } = await db
      .from('dispatch_attempts')
      .insert({
        restaurant_id: r.id,
        order_id: o.id,
        motoboy_id: d.id,
        attempt_number: 1,
        quality: 'excellent',
        counts_for_acceptance: true,
        expires_at: new Date(Date.now() + 60000).toISOString(),
      })
      .select('id')
      .single();
    const res = await acceptOffer(db, att.id, d.id);
    assert.ok(res.ok);
    const { data: after } = await db.from('motoboys').select('offers_adequate, offers_adequate_accepted').eq('id', d.id).single();
    assert.equal(after.offers_adequate, 1);
    assert.equal(after.offers_adequate_accepted, 1);
  });

  // ---------------------------------------------------------------
  // 5+6. incidentes com ORIGEM
  // ---------------------------------------------------------------
  await t('incidente: cancelamento causado pelo RESTAURANTE não penaliza o motoboy', async () => {
    const d = await mkDriver();
    const o = await mkOrder({ motoboy_id: d.id, status: 'assigned', dispatch_state: 'assigned' });
    await advanceOrderStatus(db, o.id, 'cancelled', { actorType: 'restaurant' }, {
      cancelOrigin: 'restaurant',
      cancelReason: 'loja fechou',
    });
    const { data: inc } = await db
      .from('driver_incidents')
      .select('type, origin')
      .eq('order_id', o.id)
      .maybeSingle();
    assert.ok(inc, 'incidente registrado para auditoria');
    assert.equal(inc.origin, 'restaurant');
    const perf = await computeReliabilityIndex(db, d.id, { persist: false });
    assert.equal(perf.components.incidents, 100, 'origem restaurant não deve baixar o componente de incidentes');
  });

  await t('incidente: cancelamento causado pelo MOTOBOY derruba a confiabilidade', async () => {
    const d = await mkDriver();
    const before = await computeReliabilityIndex(db, d.id, { persist: false });
    const o = await mkOrder({ motoboy_id: d.id, status: 'assigned', dispatch_state: 'assigned' });
    await advanceOrderStatus(db, o.id, 'cancelled', { actorType: 'motoboy' }, { cancelOrigin: 'driver' });
    const after = await computeReliabilityIndex(db, d.id, { persist: false });
    assert.ok(after.components.incidents < 100, 'componente de incidentes deveria cair');
    assert.ok(after.reliabilityIndex < before.reliabilityIndex);
  });

  // ---------------------------------------------------------------
  // 7. índice de confiabilidade
  // ---------------------------------------------------------------
  await t('confiabilidade: amostra pequena é puxada para 100 (não pune histórico curto)', async () => {
    const d = await mkDriver({ deliveries_total: 1, deliveries_completed: 0, deliveries_late: 0, offers_adequate: 1, offers_adequate_accepted: 0 });
    const perf = await computeReliabilityIndex(db, d.id, { persist: false });
    assert.ok(perf.completionRate > 50, `completionRate=${perf.completionRate} deveria estar puxado p/ 100`);
  });

  await t('confiabilidade: nenhum componente domina (índice entre 0 e 100)', async () => {
    const d = await mkDriver({ rating: 2, deliveries_total: 50, deliveries_completed: 10, deliveries_late: 40 });
    const perf = await computeReliabilityIndex(db, d.id, { persist: true });
    assert.ok(perf.reliabilityIndex >= 0 && perf.reliabilityIndex <= 100);
    assert.ok(perf.reliabilityIndex > 0, 'mesmo ruim, não zera por causa de um só eixo');
  });

  // ---------------------------------------------------------------
  // 8. bloqueio de entregador
  // ---------------------------------------------------------------
  await t('bloqueio: entregador bloqueado sai do pool de candidatos', async () => {
    const d = await mkDriver({ blocked: true, blocked_reason: 'teste' });
    const o = await mkOrder();
    const { candidates } = await scoreCandidatesForOrder(db, o.id);
    assert.ok(!candidates.find((c) => c.motoboyId === d.id), 'bloqueado não deveria ser candidato');
  });

  // ---------------------------------------------------------------
  // 9. lease / concorrência do cron
  // ---------------------------------------------------------------
  await t('cron: duas execuções simultâneas — uma roda, a outra é ignorada (lease)', async () => {
    await db.rpc('release_dispatch_lease');
    const [a, b] = await Promise.all([
      dispatchTick(db, { source: 'test' }),
      dispatchTick(db, { source: 'test' }),
    ]);
    const skipped = [a, b].filter((x) => x.skipped).length;
    assert.equal(skipped, 1, 'exatamente uma execução deve ser ignorada');
  });

  await t('cron: dispatch_runs registra a execução', async () => {
    await db.rpc('release_dispatch_lease');
    const res = await dispatchTick(db, { source: 'test' });
    assert.ok(res.runId || res.skipped);
    const { count } = await db.from('dispatch_runs').select('id', { count: 'exact', head: true }).eq('source', 'test');
    assert.ok(count >= 1);
  });

  // ---------------------------------------------------------------
  // 10. rate limiting
  // ---------------------------------------------------------------
  await t('rate limit: bloqueia depois de estourar o limite na janela', async () => {
    const key = `f35-${Date.now()}`;
    let lastAllowed = true;
    for (let i = 0; i < 6; i++) {
      const rl = await checkRateLimit(db, 'default', key, { limit: 3, windowSeconds: 60 });
      lastAllowed = rl.allowed;
    }
    assert.equal(lastAllowed, false, 'a 6ª requisição deveria ser bloqueada');
  });

  // ---------------------------------------------------------------
  // 11. chaves de API
  // ---------------------------------------------------------------
  await t('api key: gerar → resolve para o restaurante; revogar → deixa de resolver', async () => {
    const issued = await issueApiKey(db, r.id, { name: '[F35] key' });
    cleanup.push(() => db.from('api_keys').delete().eq('id', issued.id));
    assert.ok(issued.key.startsWith('leeva_'));
    const ok = await resolveApiKey(db, issued.key);
    assert.equal(ok?.restaurantId, r.id);
    const revoked = await revokeApiKey(db, r.id, issued.id);
    assert.equal(revoked, true);
    const gone = await resolveApiKey(db, issued.key);
    assert.equal(gone, null);
  });

  await t('api key: chave curta/aleatória não resolve', async () => {
    assert.equal(await resolveApiKey(db, 'curta'), null);
    assert.equal(await resolveApiKey(db, 'leeva_naoexistemesmoaqui00000000000000'), null);
  });

  // ---------------------------------------------------------------
  // 12. visão geral / financeiro do admin
  // ---------------------------------------------------------------
  await t('admin: visão geral agrega sem erro e devolve números', async () => {
    const o = await getAdminOverview(db, '30d');
    assert.equal(typeof o.mrr, 'number');
    assert.equal(typeof o.restaurantsActive, 'number');
    assert.ok('deltas' in o);
  });

  await t('admin: financeiro devolve unit economics (LTV com nota se amostra pequena)', async () => {
    const f = await getAdminFinance(db, '30d');
    assert.equal(typeof f.totalRevenue, 'number');
    assert.ok('unitEconomics' in f);
    if (f.unitEconomics.ltv == null) assert.ok(f.unitEconomics.ltvNote, 'sem LTV → deve explicar o porquê');
  });

  await t('admin: listagem de entregadores traz totais', async () => {
    const { rows, totals } = await listDrivers(db, {});
    assert.ok(Array.isArray(rows));
    assert.equal(typeof totals.total, 'number');
  });

  // ---------------------------------------------------------------
  // 13. RLS — cliente anônimo não lê tabelas da plataforma
  // ---------------------------------------------------------------
  await t('RLS: anônimo não lê platform_admins / dispatch_runs / error_events / reputation_config', async () => {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
    for (const table of ['platform_admins', 'dispatch_runs', 'error_events', 'reputation_config', 'rate_limit_hits', 'driver_incidents', 'api_keys']) {
      const { data } = await anon.from(table).select('*').limit(1);
      assert.deepEqual(data ?? [], [], `anônimo leu ${table}`);
    }
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
