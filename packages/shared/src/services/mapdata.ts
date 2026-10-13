/**
 * Dados do mapa da CENTRAL DE OPERAÇÕES (visão do restaurante).
 *
 * Mostra: o restaurante, os pedidos ativos e seus destinos, o estado do
 * despacho, a ETA e — para pedidos com entregador (indo buscar, retirado
 * ou em rota) — a posição do entregador responsável por AQUELE pedido.
 *
 * NUNCA expõe a rede de entregadores, telefone de motoboy nem posição de
 * quem não está numa entrega deste restaurante.
 *
 * Exceção — a EQUIPE PRÓPRIA (fleet='own', restaurant_id = este): é do
 * próprio estabelecimento, então aparece sempre em `team`, com posição
 * quando está online (mesmo parado esperando entrega).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';
import { isValidLatLng } from './geo';
import { OPEN_ORDER_STATUSES } from '../constants';

type DB = SupabaseClient<Database>;

export type MapOrderMarker = {
  id: string;
  orderNumber: number | null;
  customerName: string;
  region: string | null;
  status: Database['public']['Enums']['order_status'];
  dispatchState: Database['public']['Enums']['dispatch_state'];
  dispatchHold: boolean;
  destination: { latitude: number; longitude: number } | null;
  etaMin: number | null;
  etaMax: number | null;
  routeDistanceKm: number | null;
  late: boolean;
  driverFirstName: string | null;
  /** id interno do motoboy — liga o ponto de GPS ao vivo (Realtime) ao marcador. */
  motoboyId: string | null;
  driverPosition: { latitude: number; longitude: number } | null;
  /** ordem da parada na rota do motoboy (route_position, senão group_sequence) */
  routeOrder: number | null;
};

/** Motoboy da equipe própria, para o painel "Equipe agora" do mapa. */
export type TeamDriver = {
  id: string;
  name: string;
  phone: string;
  /** offline · livre (online sem entrega) · em entrega */
  state: 'offline' | 'free' | 'busy';
  activeOrders: number;
  position: { latitude: number; longitude: number } | null;
  /** quando o GPS dele chegou por último (ISO) */
  lastSeenAt: string | null;
  /** posição na fila (1 = próximo a receber); null = fora da fila */
  queuePos: number | null;
};

export type MapData = {
  restaurant: { name: string; position: { latitude: number; longitude: number } | null };
  orders: MapOrderMarker[];
  team: TeamDriver[];
  counts: { active: number; searching: number; inRoute: number; late: number; waiting: number };
  generatedAt: string;
};

const SLA_TOTAL_MIN = 55;
/** Status em que o restaurante vê o entregador no mapa (indo buscar → entregando). */
const DRIVER_VISIBLE: string[] = ['assigned', 'picked_up', 'in_route'];

export async function getMapData(db: DB, restaurantId: string): Promise<MapData> {
  const { data: rst } = await db
    .from('restaurants')
    .select('name, latitude, longitude')
    .eq('id', restaurantId)
    .maybeSingle();

  const { data: orders } = await db
    .from('orders')
    .select(
      'id, order_number, customer_name, region, status, dispatch_state, dispatch_hold, latitude, longitude, eta_min, eta_max, route_distance_km, created_at, motoboy_id, route_position, group_sequence',
    )
    .eq('restaurant_id', restaurantId)
    .in('status', OPEN_ORDER_STATUSES)
    .order('created_at', { ascending: true })
    .limit(200);

  const rows = orders ?? [];
  const driverIds = [
    ...new Set(rows.filter((o) => o.motoboy_id && DRIVER_VISIBLE.includes(o.status)).map((o) => o.motoboy_id!)),
  ];
  const { data: drivers } = driverIds.length
    ? await db
        .from('motoboys')
        .select('id, full_name, current_latitude, current_longitude, location_updated_at')
        .in('id', driverIds)
    : { data: [] };
  const driverById = new Map((drivers ?? []).map((d) => [d.id, d]));

  const now = Date.now();
  const markers: MapOrderMarker[] = rows.map((o) => {
    const ageMin = (now - new Date(o.created_at).getTime()) / 60000;
    const late = ageMin > SLA_TOTAL_MIN && o.status !== 'in_route' && !o.dispatch_hold;
    let driverFirstName: string | null = null;
    let driverPosition: { latitude: number; longitude: number } | null = null;
    if (o.motoboy_id && DRIVER_VISIBLE.includes(o.status)) {
      const d = driverById.get(o.motoboy_id);
      if (d) {
        driverFirstName = (d.full_name ?? 'Entregador').split(' ')[0] ?? 'Entregador';
        const fresh =
          d.location_updated_at && now - new Date(d.location_updated_at).getTime() < 5 * 60000;
        if (fresh && isValidLatLng(d.current_latitude, d.current_longitude)) {
          driverPosition = {
            latitude: d.current_latitude as number,
            longitude: d.current_longitude as number,
          };
        }
      }
    }
    return {
      id: o.id,
      orderNumber: o.order_number,
      customerName: o.customer_name,
      region: o.region,
      status: o.status,
      dispatchState: o.dispatch_state,
      dispatchHold: !!o.dispatch_hold,
      destination: isValidLatLng(o.latitude, o.longitude)
        ? { latitude: o.latitude as number, longitude: o.longitude as number }
        : null,
      etaMin: o.eta_min,
      etaMax: o.eta_max,
      routeDistanceKm: o.route_distance_km != null ? Number(o.route_distance_km) : null,
      late,
      driverFirstName,
      motoboyId: o.motoboy_id && DRIVER_VISIBLE.includes(o.status) ? o.motoboy_id : null,
      driverPosition,
      routeOrder: o.route_position ?? o.group_sequence ?? null,
    };
  });

  // equipe própria: todos os motoboys ativos do estabelecimento, online ou não
  const { data: own } = await db
    .from('motoboys')
    .select('id, full_name, phone, status, current_latitude, current_longitude, location_updated_at, queue_since')
    .eq('restaurant_id', restaurantId)
    .eq('fleet', 'own')
    .eq('active', true)
    .order('full_name')
    .limit(100);
  const busyCount = new Map<string, number>();
  for (const o of rows) {
    if (o.motoboy_id && DRIVER_VISIBLE.includes(o.status)) {
      busyCount.set(o.motoboy_id, (busyCount.get(o.motoboy_id) ?? 0) + 1);
    }
  }
  const team: (TeamDriver & { queueSince?: string | null })[] = (own ?? []).map((d) => {
    const n = busyCount.get(d.id) ?? 0;
    const online = d.status !== 'offline';
    const fresh = !!d.location_updated_at && now - new Date(d.location_updated_at).getTime() < 5 * 60000;
    return {
      id: d.id,
      name: d.full_name,
      phone: d.phone,
      state: n > 0 ? 'busy' : online ? 'free' : 'offline',
      activeOrders: n,
      position:
        (online || n > 0) && fresh && isValidLatLng(d.current_latitude, d.current_longitude)
          ? { latitude: d.current_latitude as number, longitude: d.current_longitude as number }
          : null,
      lastSeenAt: d.location_updated_at,
      queuePos: null as number | null,
      queueSince: d.queue_since,
    };
  });
  // fila: livres, por ordem de chegada (queue_since)
  team
    .filter((d) => d.state === 'free')
    .sort((a, b) => (a.queueSince ?? '9').localeCompare(b.queueSince ?? '9'))
    .forEach((d, i) => (d.queuePos = i + 1));
  for (const d of team) delete (d as { queueSince?: string | null }).queueSince;

  return {
    team,
    restaurant: {
      name: rst?.name ?? 'Restaurante',
      position: isValidLatLng(rst?.latitude, rst?.longitude)
        ? { latitude: rst!.latitude as number, longitude: rst!.longitude as number }
        : null,
    },
    orders: markers,
    counts: {
      active: markers.length,
      searching: markers.filter((m) => ['searching', 'offered'].includes(m.dispatchState)).length,
      inRoute: markers.filter((m) => ['picked_up', 'in_route'].includes(m.status)).length,
      late: markers.filter((m) => m.late).length,
      waiting: markers.filter((m) => m.status === 'waiting_dispatch' || m.status === 'preparing').length,
    },
    generatedAt: new Date().toISOString(),
  };
}
