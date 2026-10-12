'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useRealtimeOrders } from '@leeva/shared/hooks';
import {
  formatCurrencyBRL,
  ORDER_STATUS_LABELS,
  paymentPendingOnDelivery,
  type OrderStatus,
  type PaymentMethod,
  type PaymentStatus,
} from '@leeva/shared';
import { computePrepStatus } from '@leeva/shared/services/prep-status';
import { DeliveryChat } from './DeliveryChat';
import { Wallet, Map as MapIcon, Phone, MessageCircle, Route, PackageCheck, AlertTriangle } from 'lucide-react';

type Delivery = {
  id: string;
  order_number: number | null;
  status: OrderStatus;
  customer_name: string;
  customer_phone: string | null;
  customer_address: string;
  latitude: number | null;
  longitude: number | null;
  order_amount: number;
  delivery_fee: number;
  driver_payout: number | null;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  notes: string | null;
  eta_min: number | null;
  eta_max: number | null;
  ready_at: string | null;
  preparing_at: string | null;
  prep_estimate_minutes: number | null;
  source?: string;
  ifood_locator?: string | null;
  order_items: { name: string; quantity: number; notes: string | null }[];
  accepted: boolean;
  route_late?: boolean;
  route_eta?: number | null;
};

type RouteSummary = { navigationUrl: string | null; totalKm: number; lateMinutes: number };

const hhmm = (ms: number) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

function prepBadge(d: Pick<Delivery, 'ready_at' | 'preparing_at' | 'prep_estimate_minutes'>): { text: string; cls: string } | null {
  const p = computePrepStatus({ readyAt: d.ready_at, preparingAt: d.preparing_at, prepEstimateMinutes: d.prep_estimate_minutes });
  if (p.state === 'ready') return { text: p.label, cls: 'ok' };
  if (p.state === 'preparing') return { text: p.label, cls: 'warn' };
  return null;
}

const NEXT: Record<string, { to: OrderStatus; label: string; action: string }> = {
  assigned: { to: 'picked_up', label: 'Cheguei / Pedido retirado', action: 'status' },
  picked_up: { to: 'in_route', label: 'Iniciar entrega', action: 'status' },
};

/** Redimensiona a foto no navegador antes de enviar (máx 1280px, JPEG ~0.7). */
function resizePhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const max = 1280;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('canvas'));
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('imagem inválida'));
    };
    img.src = url;
  });
}

function getPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 },
    );
  });
}

export default function DeliveryFlow({
  motoboyId,
  restaurantId,
  restaurantPhone,
  deliveries,
  route,
}: {
  motoboyId: string;
  restaurantId: string | null;
  restaurantPhone?: string | null;
  deliveries: Delivery[];
  route?: RouteSummary;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const { events } = useRealtimeOrders({ motoboyId });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoErr, setPhotoErr] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [ifoodOk, setIfoodOk] = useState(false);

  // realtime → recarrega, mas com debounce e nunca no meio de uma ação
  useEffect(() => {
    if (!events.length || busy) return;
    const t = setTimeout(() => start(() => router.refresh()), 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events.length, busy]);

  if (!deliveries.length) {
    return (
      <div className="panel" style={{ textAlign: 'center' }}>
        <h1>Nenhuma entrega agora</h1>
        <p className="muted">Fique online na aba Status para receber entregas.</p>
      </div>
    );
  }

  async function call(id: string, body: unknown) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/deliveries/${id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Não foi possível concluir a ação. Tente de novo.');
      start(() => router.refresh());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function routeAction(body: unknown) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/entrega/rota', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Não foi possível mudar a rota. Tente de novo.');
      start(() => router.refresh());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** "Fazer esta agora": joga a parada escolhida pro topo, mantém o resto. */
  function doFirst(id: string) {
    const ids = [id, ...deliveries.map((d) => d.id).filter((x) => x !== id)];
    return routeAction({ action: 'reorder', orderIds: ids });
  }

  async function onPickPhoto(file: File | undefined) {
    if (!file) return;
    setPhotoErr(null);
    try {
      setPhoto(await resizePhoto(file));
    } catch {
      setPhotoErr('Não consegui usar essa foto. Tente de novo.');
    }
  }

  async function confirmDelivery(id: string) {
    const isIfood = deliveries[0]?.source === 'ifood';
    if (!photo || (!isIfood && code.trim().length < 4)) return;
    setBusy(true);
    setErr(null);
    try {
      const pos = await getPosition();
      const res = await fetch(`/api/deliveries/${id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'deliver',
          photoBase64: photo,
          confirmationCode: code.trim(),
          ifoodConfirmed: ifoodOk,
          lat: pos?.lat ?? null,
          lng: pos?.lng ?? null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Não foi possível confirmar a entrega.');
      setPhoto(null);
      setCode('');
      start(() => router.refresh());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const current = deliveries[0]!;
  const rest = deliveries.slice(1);
  const waitingPickup = deliveries.filter((d) => d.status === 'assigned' && d.accepted);
  const step = NEXT[current.status];
  const mapUrl =
    current.latitude != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${current.latitude},${current.longitude}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(current.customer_address)}`;

  return (
    <div className="grid" style={{ gap: 16 }}>
      {err && <div className="panel" style={{ color: 'var(--danger)' }}>{err}</div>}

      {deliveries.length > 1 && (
        <div className="panel">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>
              <Route size={14} /> Sua rota: {deliveries.length} paradas
              {route?.totalKm ? ` · ~${route.totalKm.toFixed(1)} km` : ''}
            </strong>
          </div>
          {route?.lateMinutes ? (
            <p style={{ color: 'var(--warn)', fontSize: 13, margin: '6px 0 0' }}>
              <AlertTriangle size={13} /> Nessa ordem, algum pedido passa ~{route.lateMinutes} min do prazo.
            </p>
          ) : (
            <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>Ordem montada pra ninguém atrasar. Você pode mudar.</p>
          )}
          <div className="grid" style={{ gap: 8, marginTop: 10 }}>
            {route?.navigationUrl && (
              <a className="button secondary" href={route.navigationUrl} target="_blank" rel="noreferrer" style={{ textAlign: 'center' }}>
                <MapIcon size={14} /> Rota completa no Google Maps
              </a>
            )}
            {current.status === 'assigned' && waitingPickup.length > 1 && (
              <button className="button" disabled={busy} onClick={() => routeAction({ action: 'pickup_all' })}>
                <PackageCheck size={14} /> {busy ? 'Aguarde…' : `Retirei todos (${waitingPickup.length} pedidos)`}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <strong>Pedido #{current.order_number}</strong>
          <span className="badge">{ORDER_STATUS_LABELS[current.status]}</span>
        </div>
        {current.status === 'assigned' &&
          (() => {
            const pb = prepBadge(current);
            return pb ? <span className={`badge ${pb.cls}`} style={{ marginTop: 6 }}>{pb.text}</span> : null;
          })()}
        <h2 style={{ margin: '8px 0 2px' }}>{current.customer_name}</h2>
        <p style={{ margin: 0 }}>{current.customer_address}</p>
        {current.eta_min != null && (
          <p className="muted" style={{ fontSize: 13 }}>
            Previsão ao cliente: {current.eta_min}–{current.eta_max} min
          </p>
        )}

        <div className="grid" style={{ margin: '12px 0' }}>
          {current.order_items.map((it, i) => (
            <div key={i}>
              {it.quantity}× {it.name}
              {it.notes ? ` — ${it.notes}` : ''}
            </div>
          ))}
        </div>

        <p style={{ margin: '4px 0' }}>
          Você recebe por esta entrega:{' '}
          <strong>{formatCurrencyBRL(Number(current.driver_payout ?? 0))}</strong>
        </p>
        {paymentPendingOnDelivery(current.payment_method, current.payment_status) &&
          Number(current.order_amount) > 0 && (
            <p style={{ margin: '4px 0', color: 'var(--warn)' }}>
              <Wallet size={14} style={{ marginRight: 4 }} />Receber do cliente na entrega:{' '}
              <strong>{formatCurrencyBRL(Number(current.order_amount))}</strong>
            </p>
          )}
        {current.notes && <p className="muted">Obs: {current.notes}</p>}

        <div className="grid" style={{ gap: 10, marginTop: 12 }}>
          <a className="button secondary" href={mapUrl} target="_blank" rel="noreferrer" style={{ textAlign: 'center' }}>
            <MapIcon size={14} /> Abrir rota no mapa
          </a>
          {current.customer_phone && (
            <a className="button secondary" href={`tel:${current.customer_phone}`} style={{ textAlign: 'center' }}>
              <Phone size={14} /> Ligar para o cliente
            </a>
          )}
          {restaurantPhone && (
            <a
              className="button secondary"
              href={`https://wa.me/55${restaurantPhone.replace(/\D/g, '')}`}
              target="_blank"
              rel="noreferrer"
              style={{ textAlign: 'center' }}
            >
              <MessageCircle size={14} /> WhatsApp do restaurante
            </a>
          )}
          <DeliveryChat orderId={current.id} />

          {current.status === 'assigned' && !current.accepted && (
            <button
              className="button"
              disabled={busy}
              onClick={() => call(current.id, { action: 'accept' })}
            >
              {busy ? 'Aguarde…' : 'Aceitar entrega'}
            </button>
          )}

          {step && (current.status !== 'assigned' || current.accepted) && (
            <button
              className="button"
              disabled={busy}
              onClick={() => call(current.id, { action: 'status', status: step.to })}
            >
              {busy ? 'Aguarde…' : step.label}
            </button>
          )}

          {current.status === 'in_route' && (
            <div className="grid" style={{ gap: 8 }}>
              <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                Para concluir, tire uma foto da entrega (porta, portaria ou o pedido no local) e
                peça pro cliente o código de confirmação dele. Você precisa estar no endereço.
              </p>
              {!photo ? (
                <label className="button secondary" style={{ textAlign: 'center', cursor: 'pointer' }}>
                  Tirar foto da entrega
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    hidden
                    onChange={(e) => onPickPhoto(e.target.files?.[0])}
                  />
                </label>
              ) : (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo}
                    alt="Foto da entrega"
                    style={{ width: '100%', borderRadius: 10, maxHeight: 260, objectFit: 'cover' }}
                  />
                  <button className="button ghost" type="button" disabled={busy} onClick={() => setPhoto(null)}>
                    Tirar outra
                  </button>
                  {current.source === 'ifood' ? (
                    <>
                      <div className="panel" style={{ padding: 12 }}>
                        <div className="muted" style={{ fontSize: 12 }}>Localizador do iFood</div>
                        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '0.15em' }}>{current.ifood_locator ?? '—'}</div>
                        <a
                          className="button secondary"
                          href="https://confirmacao-entrega-propria.ifood.com.br/"
                          target="_blank"
                          rel="noreferrer"
                          style={{ textAlign: 'center', marginTop: 8 }}
                          onClick={() => {
                            // já copia o localizador: no site do iFood é só colar
                            if (current.ifood_locator) void navigator.clipboard?.writeText(current.ifood_locator).catch(() => {});
                          }}
                        >
                          Copiar localizador e abrir o iFood
                        </a>
                        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                          No site do iFood: cole o localizador, peça ao cliente o código de 4 números e confirme.
                        </div>
                      </div>
                      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
                        <input type="checkbox" checked={ifoodOk} onChange={(e) => setIfoodOk(e.target.checked)} />
                        Confirmei a entrega no link do iFood
                      </label>
                    </>
                  ) : (
                    <input
                      className="input"
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="Código de confirmação do cliente"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    />
                  )}
                  <button
                    className="button"
                    disabled={busy || (current.source === 'ifood' ? !ifoodOk : code.trim().length < 4)}
                    onClick={() => confirmDelivery(current.id)}
                  >
                    {busy ? 'Confirmando…' : 'Confirmar entrega'}
                  </button>
                </>
              )}
              {photoErr && <p style={{ color: 'var(--danger)', fontSize: 13, margin: 0 }}>{photoErr}</p>}
            </div>
          )}
        </div>
      </div>

      {rest.length > 0 && (
        <div className="panel">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>Próximas ({rest.length})</strong>
            <button className="button ghost" style={{ fontSize: 12, padding: '4px 8px' }} disabled={busy} onClick={() => routeAction({ action: 'reset' })}>
              Usar ordem sugerida
            </button>
          </div>
          {rest.map((d, i) => (
            <div key={d.id} style={{ fontSize: 14, marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="badge">{i + 2}</span>
              <div style={{ flex: 1 }}>
                <div>#{d.order_number} — {d.customer_name}</div>
                <div className="muted" style={{ fontSize: 13 }}>{d.customer_address}</div>
                {d.route_eta ? (
                  <div style={{ fontSize: 12, color: d.route_late ? 'var(--warn)' : undefined }} className={d.route_late ? '' : 'muted'}>
                    chega ~{hhmm(d.route_eta)}{d.route_late ? ' · passa do prazo' : ''}
                  </div>
                ) : null}
              </div>
              {current.status !== 'in_route' && (
                <button className="button secondary" style={{ fontSize: 12, padding: '6px 10px' }} disabled={busy} onClick={() => doFirst(d.id)}>
                  Fazer agora
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
