import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreCandidatesForOrder, type ScoredCandidate } from '../services/autodispatch';
import { __setRoutingService, StraightLineRoutingService } from '../services/routing';

// Sem OSRM_BASE_URL/MAPBOX_TOKEN no ambiente de teste, getRoutingService() já
// cairia em StraightLineRoutingService — fixamos explicitamente por clareza.
__setRoutingService(new StraightLineRoutingService());

// ---------------------------------------------------------------------------
// Mock mínimo do client do Supabase: cada método de filtro devolve a própria
// cadeia; o resultado final é fixado por tabela (e, pra 'orders', pela ordem
// da chamada — a 1ª busca o pedido, a 2ª busca as entregas ativas da frota).
// ---------------------------------------------------------------------------
function chainable(result: unknown) {
  const rows = Array.isArray(result) ? result : result == null ? [] : [result];
  const chain: Record<string, unknown> = {};
  const passthrough = ['select', 'eq', 'gte', 'lte', 'lt', 'gt', 'limit', 'order', 'in', 'or', 'is', 'neq', 'not'];
  for (const m of passthrough) chain[m] = () => chain;
  chain.maybeSingle = async () => ({ data: result ?? null, error: null });
  chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve({ data: rows, error: null }).then(resolve, reject);
  return chain;
}

type FakeSpec = {
  orderRow: Record<string, unknown>;
  restaurantRow: Record<string, unknown>;
  motoboys: Record<string, unknown>[];
  activeOrders?: Record<string, unknown>[];
  /** restaurant_driver_prefs: favorito/bloqueado por restaurante */
  prefs?: Record<string, unknown>[];
};

function makeFakeDb(spec: FakeSpec) {
  let ordersCalls = 0;
  return {
    from(table: string) {
      if (table === 'orders') {
        ordersCalls += 1;
        return chainable(ordersCalls === 1 ? spec.orderRow : (spec.activeOrders ?? []));
      }
      if (table === 'restaurants') return chainable(spec.restaurantRow);
      if (table === 'terms_versions') return chainable(null);
      if (table === 'motoboys') return chainable(spec.motoboys);
      if (table === 'restaurant_driver_prefs') return chainable(spec.prefs ?? []);
      throw new Error(`tabela não mockada no teste: ${table}`);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const PICKUP = { latitude: -7.1195, longitude: -34.845 };
// ~1 grau de latitude ≈ 111 km — desloca só em latitude pra controlar a
// distância até a coleta de cada motoboy.
const nearMotoboy = { latitude: PICKUP.latitude + 2 / 111, longitude: PICKUP.longitude }; // ~2 km
const farMotoboy = { latitude: PICKUP.latitude + 8 / 111, longitude: PICKUP.longitude }; // ~8 km

function motoboy(id: string, name: string, pos: { latitude: number; longitude: number }) {
  return {
    id,
    full_name: name,
    fleet: 'leeva',
    restaurant_id: null,
    status: 'available',
    active: true,
    blocked: false,
    current_latitude: pos.latitude,
    current_longitude: pos.longitude,
    location_updated_at: new Date().toISOString(),
    max_concurrent_deliveries: 3,
    rating: 4.8,
    deliveries_total: 20,
    deliveries_completed: 20,
    deliveries_late: 0,
    avg_delay_min: 0,
  };
}

function baseOrder(overrides: Record<string, unknown>) {
  return {
    id: 'order-1',
    order_number: 1001,
    restaurant_id: 'rest-1',
    latitude: PICKUP.latitude,
    longitude: PICKUP.longitude + 5 / 111,
    status: 'preparing',
    motoboy_id: null,
    group_id: null,
    ready_at: null,
    preparing_at: null,
    prep_estimate_minutes: null,
    ...overrides,
  };
}

const RESTAURANT = {
  latitude: PICKUP.latitude,
  longitude: PICKUP.longitude,
  fleet_mode: 'leeva',
  logistics_config: {},
};

// ---------------------------------------------------------------------------

test('fila: pedido em preparo não espera janela — o primeiro da fila já recebe', async () => {
  const preparingAt = new Date(Date.now() - 1 * 60_000).toISOString();
  const db = makeFakeDb({
    orderRow: baseOrder({ preparing_at: preparingAt, prep_estimate_minutes: 120 }),
    restaurantRow: RESTAURANT,
    motoboys: [motoboy('near', 'Perto', nearMotoboy), motoboy('far', 'Longe', farMotoboy)],
  });

  const { candidates, waitingForTiming } = await scoreCandidatesForOrder(db, 'order-1');
  for (const c of candidates) {
    assert.equal(c.minutesUntilDispatch, null);
    assert.equal(c.blockers.length, 0, `${c.name} não devia ter blocker: ${c.blockers.join(', ')}`);
  }
  assert.equal(waitingForTiming, false);
});

test('fila: livre que ficou disponível primeiro vem na frente (mesmo mais longe); ocupado só depois', async () => {
  const cedo = new Date(Date.now() - 30 * 60_000).toISOString();
  const tarde = new Date(Date.now() - 2 * 60_000).toISOString();
  const db = makeFakeDb({
    orderRow: baseOrder({ status: 'ready' }),
    restaurantRow: RESTAURANT,
    motoboys: [
      { ...motoboy('perto', 'Perto', nearMotoboy), queue_since: tarde },
      { ...motoboy('longe', 'Longe', farMotoboy), queue_since: cedo },
      { ...motoboy('ocupado', 'Ocupado', PICKUP), queue_since: null },
    ],
    activeOrders: [{ id: 'x', motoboy_id: 'ocupado', latitude: PICKUP.latitude, longitude: PICKUP.longitude, status: 'in_route' }],
  });

  const { candidates } = await scoreCandidatesForOrder(db, 'order-1');
  assert.deepEqual(
    candidates.map((c) => c.motoboyId),
    ['longe', 'perto', 'ocupado'],
  );
  assert.ok(candidates[0]!.reasons.includes('primeiro da fila'));
});

test('Bloco 3: pedido já pronto (ready_at) despacha na hora, sem esperar ninguém', async () => {
  const db = makeFakeDb({
    orderRow: baseOrder({
      ready_at: new Date().toISOString(),
      preparing_at: new Date(Date.now() - 20 * 60_000).toISOString(),
      prep_estimate_minutes: 15, // já venceu, mas ready_at manda
    }),
    restaurantRow: RESTAURANT,
    motoboys: [motoboy('near', 'Perto', nearMotoboy), motoboy('far', 'Longe', farMotoboy)],
  });

  const { candidates } = await scoreCandidatesForOrder(db, 'order-1');
  for (const c of candidates) {
    assert.equal(c.minutesUntilDispatch, null);
    assert.ok(!c.blockers.some((b) => b.includes('em preparo')));
  }
});

test('corrida extra: candidato já em rota perto do novo destino fica marcado (nearestActiveDrop)', async () => {
  // pedido novo: PICKUP + 5km de longitude. Entrega ativa do motoboy "busy"
  // cai a ~0,4 km dali → deve virar candidato a "corrida extra" (perto o
  // bastante pro raio padrão de agrupamento, 1,5 km).
  const newDropoffLng = PICKUP.longitude + 5 / 111;
  const activeDropoffLng = PICKUP.longitude + 5.4 / 111;

  const db = makeFakeDb({
    orderRow: baseOrder({ status: 'waiting_dispatch' }),
    restaurantRow: RESTAURANT,
    motoboys: [motoboy('busy', 'Ocupado', PICKUP), motoboy('free', 'Livre', PICKUP)],
    activeOrders: [
      { id: 'active-1', motoboy_id: 'busy', latitude: PICKUP.latitude, longitude: activeDropoffLng, status: 'in_route' },
    ],
  });

  const { candidates } = await scoreCandidatesForOrder(db, 'order-1');
  const busy = candidates.find((c) => c.motoboyId === 'busy')!;
  const free = candidates.find((c) => c.motoboyId === 'free')!;

  assert.ok(busy.nearestActiveDrop != null, 'motoboy ocupado devia ter uma entrega ativa próxima marcada');
  assert.ok(busy.nearestActiveDropKm != null && busy.nearestActiveDropKm < 1.5, `esperado <1,5km, veio ${busy.nearestActiveDropKm}`);
  assert.equal(free.nearestActiveDrop, null);
  assert.equal(free.nearestActiveDropKm, null);
});

test('Bloco 3: pedido sem estimativa de preparo despacha na hora (fallback já usado no Bloco 1)', async () => {
  const db = makeFakeDb({
    orderRow: baseOrder({ status: 'waiting_dispatch', preparing_at: null, prep_estimate_minutes: null }),
    restaurantRow: RESTAURANT,
    motoboys: [motoboy('near', 'Perto', nearMotoboy)],
  });

  const { candidates } = await scoreCandidatesForOrder(db, 'order-1');
  const near = candidates[0] as ScoredCandidate;
  assert.equal(near.minutesUntilDispatch, null);
  assert.equal(near.blockers.length, 0);
});

test('favorito do restaurante ganha prioridade num empate; bloqueado nem entra', async () => {
  const same = { latitude: PICKUP.latitude + 3 / 111, longitude: PICKUP.longitude };
  const db = makeFakeDb({
    orderRow: baseOrder({ status: 'ready' }),
    restaurantRow: RESTAURANT,
    motoboys: [motoboy('a', 'A', same), motoboy('b', 'B', same), motoboy('c', 'C', nearMotoboy)],
    prefs: [
      { motoboy_id: 'b', kind: 'favorite' },
      { motoboy_id: 'c', kind: 'blocked' },
    ],
  });

  const { candidates } = await scoreCandidatesForOrder(db, 'order-1');
  assert.equal(candidates.find((x) => x.motoboyId === 'c'), undefined, 'bloqueado não pode receber oferta');
  const a = candidates.find((x) => x.motoboyId === 'a')!;
  const b = candidates.find((x) => x.motoboyId === 'b')!;
  assert.ok(b.score > a.score, `favorito devia pontuar mais: ${b.score} vs ${a.score}`);
  assert.equal(candidates[0]!.motoboyId, 'b');
});
