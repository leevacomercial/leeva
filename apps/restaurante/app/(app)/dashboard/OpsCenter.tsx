'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useLiveOps } from '@leeva/shared/hooks';
import { ORDER_STATUS_LABELS, formatCurrencyBRL } from '@leeva/shared';
import type { Situation, MapData } from '@leeva/shared/services';
import { apiGet, apiPost } from '../_lib/client';
import LeevaMap, { type MapLine, type MapMarker } from '../_lib/LeevaMap';
import { applyDriverPosition } from '../_lib/liveMap';

type Alert = { key: string; severity: string; title: string; message: string };
type MapOrder = MapData['orders'][number];
type TeamDriver = MapData['team'][number];

/**
 * AO VIVO — o mapa é a tela (modelo Foody): ocupa o painel inteiro e mostra
 * de relance a operação. Cada motoboy tem uma COR; os pedidos dele aparecem
 * nessa cor, com o número dentro do pino, e uma linha liga o motoboy às
 * paradas na ordem da rota. Pedido sem motoboy fica laranja; atrasado ganha
 * contorno vermelho. Ao lado, um painel flutuante com Pedidos e Motoboys.
 *
 * Tudo chega pelo Supabase Realtime — o recarregamento periódico é só rede
 * de segurança (e para os atrasos, que dependem do relógio).
 */
export default function OpsCenter({
  restaurantId,
  initialSituation,
  initialAlerts,
  initialMap,
  mapConfig,
  finance,
}: {
  restaurantId: string;
  initialSituation: Situation;
  initialAlerts: Alert[];
  initialMap: MapData;
  mapConfig: { tileUrl: string; attribution: string };
  finance: { deliveries: number; cost: number; margin: number; avgCost: number | null };
}) {
  const [situation, setSituation] = useState(initialSituation);
  const [alerts, setAlerts] = useState(initialAlerts);
  const [map, setMap] = useState(initialMap);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<'orders' | 'team'>('orders');
  const [panelOpen, setPanelOpen] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [a, m] = await Promise.all([
        apiPost<{ alerts: { active: Alert[] }; situation: Situation }>('/api/alerts/evaluate'),
        apiGet<MapData>('/api/map'),
      ]);
      setSituation(a.situation);
      setAlerts(a.alerts.active);
      setMap(m);
    } catch {
      /* ignora — próxima mudança ou o intervalo tentam de novo */
    }
  }, []);

  const { connected } = useLiveOps(restaurantId, {
    onDriverPosition: (p) => setMap((prev) => applyDriverPosition(prev, p)),
    onOrdersChange: () => void refresh(),
  });

  useEffect(() => {
    // rede de segurança: 1x por minuto, só com a aba visível
    const iv = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 60000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  const team = useMemo(() => map.team ?? [], [map.team]);
  const colors = useMemo(() => driverColors(team, map.orders), [team, map.orders]);

  // posição atual de cada motoboy: GPS da equipe, senão o que veio no pedido
  const driverPos = useMemo(() => {
    const pos = new Map<string, { latitude: number; longitude: number }>();
    for (const d of team) if (d.position) pos.set(d.id, d.position);
    for (const o of map.orders) if (o.motoboyId && o.driverPosition && !pos.has(o.motoboyId)) pos.set(o.motoboyId, o.driverPosition);
    return pos;
  }, [team, map.orders]);

  const markers = useMemo<MapMarker[]>(() => {
    const out: MapMarker[] = [];
    if (map.restaurant.position) {
      out.push({
        id: 'restaurant',
        lat: map.restaurant.position.latitude,
        lng: map.restaurant.position.longitude,
        label: map.restaurant.name,
        kind: 'restaurant',
        popupHtml: `<b>${escapeHtml(map.restaurant.name)}</b><br/>ponto de coleta`,
      });
    }
    for (const o of map.orders) {
      if (!o.destination) continue;
      out.push({
        id: o.id,
        lat: o.destination.latitude,
        lng: o.destination.longitude,
        label: `#${o.orderNumber}`,
        text: o.orderNumber != null ? String(o.orderNumber).slice(-3) : '',
        kind: 'order',
        late: o.late,
        color: o.motoboyId ? colors.get(o.motoboyId) ?? NO_DRIVER : NO_DRIVER,
        onClick: () => {
          setSelected(o.id);
          setTab('orders');
          setPanelOpen(true);
        },
        popupHtml: `<b>Pedido #${o.orderNumber ?? '—'}</b><br/>${escapeHtml(o.customerName)}<br/>${escapeHtml(o.region ?? '')}<br/>${ORDER_STATUS_LABELS[o.status]}${o.driverFirstName ? ` · ${escapeHtml(o.driverFirstName)}` : ''}${o.etaMin ? ` · ${o.etaMin}–${o.etaMax} min` : ''}`,
      });
    }
    const named = new Map(team.map((d) => [d.id, d]));
    for (const [id, p] of driverPos) {
      const d = named.get(id);
      const carrying = map.orders.filter((x) => x.motoboyId === id);
      const name = d?.name ?? carrying[0]?.driverFirstName ?? 'Entregador';
      out.push({
        id: `driver-${id}`,
        lat: p.latitude,
        lng: p.longitude,
        label: name.split(' ')[0] ?? name,
        kind: 'driver',
        showLabel: true,
        color: colors.get(id) ?? FREE_COLOR,
        onClick: () => {
          setTab('team');
          setPanelOpen(true);
        },
        popupHtml: `<b>${escapeHtml(name)}</b><br/>${
          carrying.length
            ? `levando ${carrying.map((x) => `#${x.orderNumber ?? '—'}`).join(', ')}`
            : d?.queuePos
              ? `${d.queuePos}º na fila`
              : 'livre'
        }`,
      });
    }
    return out;
  }, [map, team, colors, driverPos]);

  // rota de cada motoboy: posição dele → (coleta, se ainda não retirou) → paradas na ordem
  const lines = useMemo<MapLine[]>(() => {
    const out: MapLine[] = [];
    const byDriver = new Map<string, MapOrder[]>();
    for (const o of map.orders) {
      if (!o.motoboyId || !o.destination) continue;
      byDriver.set(o.motoboyId, [...(byDriver.get(o.motoboyId) ?? []), o]);
    }
    for (const [id, list] of byDriver) {
      const pts: [number, number][] = [];
      const here = driverPos.get(id);
      if (here) pts.push([here.latitude, here.longitude]);
      const needsPickup = list.some((o) => o.status === 'assigned');
      if (needsPickup && map.restaurant.position)
        pts.push([map.restaurant.position.latitude, map.restaurant.position.longitude]);
      list
        .sort((a, b) => (a.routeOrder ?? 99) - (b.routeOrder ?? 99))
        .forEach((o) => pts.push([o.destination!.latitude, o.destination!.longitude]));
      out.push({ id, color: colors.get(id) ?? FREE_COLOR, points: pts, dashed: needsPickup });
    }
    return out;
  }, [map, driverPos, colors]);

  const groups = useMemo(() => groupOrders(map.orders), [map.orders]);
  const problems = alerts.filter((a) => a.severity !== 'ok');
  const c = situation.counters;
  const freeCount = team.filter((d) => d.state === 'free').length;
  const busyCount = team.filter((d) => d.state === 'busy').length;
  const waitingCount = map.orders.filter((o) => !o.motoboyId).length;
  const selectedOrder = map.orders.find((o) => o.id === selected) ?? null;

  return (
    <div className="ops-full">
      <LeevaMap
        markers={markers}
        lines={lines}
        tileUrl={mapConfig.tileUrl}
        attribution={mapConfig.attribution}
        focusId={focusId}
        className="leaflet-map ops-full-map"
        fitPadding={panelOpen ? [360, 60] : [0, 60]}
      />

      {/* barra de cima: números da operação, de relance */}
      <div className="ops-topbar">
        <span className="ops-live">
          <span className={`dot ${connected ? 'ok' : ''}`} /> {connected ? 'Ao vivo' : 'Conectando…'} · <Clock />
        </span>
        <span className={`ops-chip ${waitingCount > 0 ? 'warn' : ''}`}><b>{waitingCount}</b> sem motoboy</span>
        <span className="ops-chip"><b>{map.counts.inRoute}</b> em rota</span>
        <span className="ops-chip"><b>{freeCount}</b> livres · <b>{busyCount}</b> em entrega</span>
        <span className={`ops-chip ${c.late > 0 ? 'danger' : ''}`}><b>{c.late}</b> atrasadas</span>
        <Link href="/financeiro" className="ops-chip">
          <b>{finance.avgCost != null ? formatCurrencyBRL(finance.avgCost) : '—'}</b> média por entrega
        </Link>
      </div>

      {!panelOpen && (
        <button type="button" className="ops-panel-toggle" onClick={() => setPanelOpen(true)}>
          Pedidos ({map.orders.length}) · Motoboys ({freeCount + busyCount})
        </button>
      )}

      {panelOpen && (
        <aside className="ops-panel">
          <div className="ops-panel-head">
            <div className="seg" style={{ flex: 1 }}>
              <button type="button" className={`seg-btn ${tab === 'orders' ? 'active' : ''}`} onClick={() => setTab('orders')}>
                Pedidos ({map.orders.length})
              </button>
              <button type="button" className={`seg-btn ${tab === 'team' ? 'active' : ''}`} onClick={() => setTab('team')}>
                Motoboys ({freeCount + busyCount}/{team.length})
              </button>
            </div>
            <button type="button" className="btn sm" onClick={() => setPanelOpen(false)} title="Esconder painel">
              ✕
            </button>
          </div>

          {situation.level !== 'ok' && (
            <div className={`op-alert ${situation.level}`} style={{ margin: '0 0 8px' }}>
              <div>
                <strong>{situation.headline}</strong>
                {situation.action && <div style={{ fontSize: 13 }}>{situation.action}</div>}
              </div>
            </div>
          )}
          {problems.map((a) => (
            <div key={a.key} className={`op-alert ${a.severity}`} style={{ margin: '0 0 8px' }}>
              <div>
                <strong>{a.title}</strong>
                <div style={{ fontSize: 13 }}>{a.message}</div>
              </div>
            </div>
          ))}

          {tab === 'team' ? (
            <TeamList team={team} orders={map.orders} colors={colors} onFocus={setFocusId} />
          ) : (
            <div className="ops-list">
              {groups.map((g) => (
                <div key={g.key}>
                  <div className="ops-group">{g.title} · {g.orders.length}</div>
                  {g.orders.map((o) => {
                    const color = o.motoboyId ? colors.get(o.motoboyId) ?? NO_DRIVER : NO_DRIVER;
                    const open = selected === o.id;
                    return (
                      <div key={o.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelected(open ? null : o.id);
                            setFocusId(o.id);
                          }}
                          className={`ops-item ${open ? 'active' : ''}`}
                        >
                          <span className="ops-num" style={{ background: color }}>
                            {o.orderNumber != null ? String(o.orderNumber).slice(-3) : '—'}
                          </span>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span className="ops-item-title">{o.customerName}</span>
                            <span className="ops-item-sub">
                              {o.region ?? (o.destination ? 'destino no mapa' : 'sem endereço')}
                              {o.driverFirstName ? ` · ${o.driverFirstName}` : ''}
                              {o.etaMin ? ` · ${o.etaMin}–${o.etaMax} min` : ''}
                            </span>
                          </span>
                          {o.late && <span className="tag red">atrasada</span>}
                        </button>
                        {open && selectedOrder && (
                          <ManualDispatch order={selectedOrder} team={team} orders={map.orders} onDone={refresh} />
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
              {map.orders.length === 0 && (
                <div className="muted" style={{ fontSize: 13, padding: 8 }}>
                  Nenhuma entrega ativa agora. <Link href="/pedidos">Criar entrega →</Link>
                </div>
              )}
            </div>
          )}
        </aside>
      )}
    </div>
  );
}

const FREE_COLOR = '#a78bfa';
const NO_DRIVER = '#ff5a1f';
/** Cores dos motoboys — bem distintas entre si e do laranja de "sem motoboy". */
const PALETTE = ['#2563eb', '#16a34a', '#db2777', '#0891b2', '#9333ea', '#ca8a04', '#0d9488', '#dc2626', '#4f46e5', '#65a30d'];

/** Cor fixa por motoboy (ordem estável por id), pra o mesmo motoboy não trocar de cor a cada atualização. */
function driverColors(team: TeamDriver[], orders: MapOrder[]) {
  const ids = new Set<string>(team.map((d) => d.id));
  for (const o of orders) if (o.motoboyId) ids.add(o.motoboyId);
  const sorted = [...ids].sort();
  return new Map(sorted.map((id, i) => [id, PALETTE[i % PALETTE.length]!]));
}

/** Distância em linha reta (km) — só pra ordenar quem está mais perto. */
function km(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.latitude * Math.PI) / 180) * Math.cos((b.latitude * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * "Mandar pra…" / "Trocar": o despacho é pela fila, mas o dono pode passar
 * por cima e mandar (ou trocar) o pedido pra alguém da equipe online.
 */
function ManualDispatch({
  order,
  team,
  orders,
  onDone,
}: {
  order: MapOrder;
  team: TeamDriver[];
  orders: MapOrder[];
  onDone: () => Promise<void>;
}) {
  const online = team
    .filter((d) => d.state !== 'offline' && d.id !== order.motoboyId)
    .map((d) => ({
      ...d,
      load: orders.filter((o) => o.motoboyId === d.id).length,
      dist: d.position && order.destination ? km(d.position, order.destination) : null,
    }))
    .sort((a, b) => (a.queuePos ?? 99) - (b.queuePos ?? 99) || (a.dist ?? 99) - (b.dist ?? 99));
  const [pick, setPick] = useState(online[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (['picked_up', 'in_route'].includes(order.status)) {
    return <div className="ops-dispatch muted">Já saiu pra entrega com {order.driverFirstName ?? 'o motoboy'}.</div>;
  }
  if (!online.length) {
    return <div className="ops-dispatch muted">Ninguém da equipe online agora pra mandar manualmente.</div>;
  }

  async function send() {
    setBusy(true);
    setErr(null);
    try {
      await apiPost(`/api/orders/${order.id}/dispatch`, { motoboyId: pick, reassign: !!order.motoboyId });
      await onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ops-dispatch">
      <span className="muted" style={{ fontSize: 12 }}>
        {order.motoboyId ? `Com ${order.driverFirstName ?? 'motoboy'}. Trocar por:` : 'Não quer esperar a fila? Mande direto:'}
      </span>
      <div style={{ display: 'flex', gap: 6 }}>
        <select className="select" value={pick} onChange={(e) => setPick(e.target.value)} disabled={busy} style={{ flex: 1, minWidth: 0 }}>
          {online.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name.split(' ')[0]} — {d.queuePos ? `${d.queuePos}º na fila` : STATE_LABEL[d.state]}
              {d.load ? ` (${d.load} na rota)` : ''}
              {d.dist != null ? ` · ${d.dist.toFixed(1).replace('.', ',')} km` : ''}
            </option>
          ))}
        </select>
        <button type="button" className="btn primary sm" onClick={send} disabled={busy || !pick}>
          {busy ? '…' : order.motoboyId ? 'Trocar' : 'Mandar'}
        </button>
      </div>
      {err && <span style={{ color: 'var(--danger)', fontSize: 12 }}>{err}</span>}
    </div>
  );
}
const STATE_LABEL = { busy: 'em entrega', free: 'livre', offline: 'offline' } as const;

/** A equipe agora, cada um na sua cor: fila, quem está levando o quê e quem sumiu do GPS. */
function TeamList({
  team,
  orders,
  colors,
  onFocus,
}: {
  team: TeamDriver[];
  orders: MapOrder[];
  colors: Map<string, string>;
  onFocus: (id: string) => void;
}) {
  const order = { free: 0, busy: 1, offline: 2 } as const;
  const sorted = [...team].sort(
    (a, b) => order[a.state] - order[b.state] || (a.queuePos ?? 99) - (b.queuePos ?? 99) || a.name.localeCompare(b.name),
  );
  return (
    <div className="ops-list">
      {sorted.map((d) => {
        const carrying = orders.filter((o) => o.motoboyId === d.id);
        const digits = d.phone.replace(/\D/g, '');
        const wa = digits ? `https://wa.me/${digits.length <= 11 ? `55${digits}` : digits}` : null;
        const noGps = d.state !== 'offline' && !d.position;
        return (
          <div key={d.id} className="ops-item" style={{ opacity: d.state === 'offline' ? 0.55 : 1 }}>
            <span className="ops-num" style={{ background: d.state === 'offline' ? 'var(--muted)' : colors.get(d.id) ?? FREE_COLOR }}>
              {d.queuePos ? `${d.queuePos}º` : d.name.slice(0, 1).toUpperCase()}
            </span>
            <button
              type="button"
              onClick={() => d.position && onFocus(`driver-${d.id}`)}
              disabled={!d.position}
              style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 0, padding: 0, color: 'inherit', cursor: d.position ? 'pointer' : 'default' }}
            >
              <span className="ops-item-title">{d.name}</span>
              <span className="ops-item-sub">
                {d.queuePos ? `${d.queuePos}º na fila` : STATE_LABEL[d.state]}
                {carrying.length > 0 ? ` · ${carrying.map((o) => `#${o.orderNumber ?? '—'}`).join(', ')}` : ''}
                {noGps ? ' · sem GPS agora' : ''}
                {d.lastSeenAt ? ` · visto ${ago(d.lastSeenAt)}` : ''}
              </span>
            </button>
            {wa && (
              <a className="btn sm" href={wa} target="_blank" rel="noreferrer" title="Chamar no WhatsApp">
                Zap
              </a>
            )}
          </div>
        );
      })}
      {team.length === 0 && <div className="muted" style={{ fontSize: 13, padding: 8 }}>Nenhum motoboy cadastrado ainda.</div>}
      <Link href="/equipe" className="muted" style={{ fontSize: 12, marginTop: 6, padding: '0 8px' }}>
        Cadastrar ou convidar motoboy →
      </Link>
    </div>
  );
}

function ago(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `há ${h} h` : `há ${Math.round(h / 24)} d`;
}

/** Agrupa as entregas pela etapa, na ordem em que o restaurante age. */
function groupOrders(orders: MapOrder[]) {
  const defs: { key: string; title: string; match: (o: MapOrder) => boolean }[] = [
    { key: 'waiting', title: 'Sem motoboy', match: (o) => !o.motoboyId },
    { key: 'assigned', title: 'Indo buscar', match: (o) => o.status === 'assigned' },
    { key: 'route', title: 'Em rota', match: (o) => o.status === 'picked_up' || o.status === 'in_route' },
    { key: 'other', title: 'Outros', match: () => true },
  ];
  const used = new Set<string>();
  return defs
    .map((d) => {
      const list = orders.filter((o) => !used.has(o.id) && d.match(o));
      list.forEach((o) => used.add(o.id));
      return { key: d.key, title: d.title, orders: list };
    })
    .filter((g) => g.orders.length > 0);
}

/** Relógio isolado: re-renderiza só a si mesmo a cada segundo, não a página/mapa. */
function Clock() {
  const [t, setT] = useState('');
  useEffect(() => {
    setT(new Date().toLocaleTimeString('pt-BR'));
    const i = setInterval(() => setT(new Date().toLocaleTimeString('pt-BR')), 1000);
    return () => clearInterval(i);
  }, []);
  return <span suppressHydrationWarning>{t}</span>;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
