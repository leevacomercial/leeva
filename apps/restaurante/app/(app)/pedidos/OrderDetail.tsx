'use client';

import { useEffect, useState } from 'react';
import {
  ORDER_STATUS_LABELS,
  DISPATCH_STATE_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  formatCurrencyBRL,
  formatDateTime,
  type OrderStatus,
  type DispatchState,
} from '@leeva/shared';
import { apiGet, apiPost } from '../_lib/client';
import { OrderChat } from './OrderChat';
import { Icon } from '../../_icons/Icon';

type OrderRow = {
  id: string;
  order_number: number | null;
  status: OrderStatus;
  dispatch_state: DispatchState;
  customer_name: string;
  customer_phone: string | null;
  customer_address: string;
  order_amount: number;
  delivery_fee: number;
  payment_method: string;
  payment_status: string;
  notes: string | null;
  motoboy_id: string | null;
  delivery_confirmation_code: string | null;
  leeva_fee: number | null;
  driver_payout: number | null;
  logistics_margin: number | null;
  route_distance_km: number | null;
  order_items: { id: string; name: string; quantity: number; unit_price: number; notes: string | null }[];
};

type Detail = {
  order: Record<string, unknown> & {
    created_at: string;
    confirmed_at: string | null;
    dispatched_at: string | null;
    accepted_at: string | null;
    picked_up_at: string | null;
    in_route_at: string | null;
    delivered_at: string | null;
  };
  timeline: { id: number; type: string; created_at: string }[];
  trackingUrl: string | null;
  notifications: { channel: string; body: string; status: string; error: string | null }[];
  dispatchAttempts?: { attempt_number: number; outcome: string | null; reason: string | null; offered_at: string; score: number | null }[];
  deliveryPhotoUrl?: string | null;
};

type TeamDriver = { id: string; name: string; state: 'offline' | 'free' | 'busy'; activeOrders: number; queuePos: number | null };

type GroupPeer = { orderNumber: number | null; customerName: string; seq: number | null };

export default function OrderDetail({
  order,
  groupPeers,
  motoboy,
  autoOpenChat,
  onChanged,
}: {
  order: OrderRow;
  groupPeers?: GroupPeer[];
  motoboy?: { fullName: string; phone: string | null; avatarUrl?: string | null };
  autoOpenChat?: boolean;
  onChanged: () => void;
}) {
  const [d, setD] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [team, setTeam] = useState<TeamDriver[] | null>(null);
  const [ownFleet, setOwnFleet] = useState(false);
  const [pick, setPick] = useState('');
  const open = !['delivered', 'cancelled'].includes(order.status);

  useEffect(() => {
    apiGet<{ team: TeamDriver[]; ownFleet: boolean }>('/api/team')
      .then((r) => {
        setTeam(r.team);
        setOwnFleet(r.ownFleet);
      })
      .catch(() => {});
    apiGet<Detail>(`/api/orders/${order.id}`).then(setD).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const o = d?.order;
  const stamps: [string, string | null | undefined][] = o
    ? [
        ['Criado', o.created_at],
        ['Confirmado', o.confirmed_at],
        ['Despachado', o.dispatched_at],
        ['Aceite', o.accepted_at],
        ['Coletado', o.picked_up_at],
        ['Saiu para entrega', o.in_route_at],
        ['Entregue', o.delivered_at],
      ]
    : [];

  return (
    <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 14, display: 'grid', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div>
          <div className="card-title">Pedido</div>
          {order.order_items.map((i) => (
            <div key={i.id} className="muted" style={{ fontSize: 13 }}>
              {i.quantity}× {i.name}
              {i.unit_price ? ` — ${formatCurrencyBRL(i.unit_price)}` : ''}
            </div>
          ))}
          {order.customer_phone && <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>Tel: {order.customer_phone}</div>}
          {order.notes && <div className="muted" style={{ fontSize: 13 }}>Obs: {order.notes}</div>}

          {motoboy && (
            <div className="section" style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12 }} className="muted">Entregador</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {motoboy.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={motoboy.avatarUrl} alt="" width={40} height={40} style={{ borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                  <span
                    style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--brand-weak, #e1f2ea)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}
                  >
                    {motoboy.fullName.trim().slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div style={{ fontWeight: 600 }}>{motoboy.fullName}</div>
              </div>
              {motoboy.phone && (
                <a
                  className="button secondary sm"
                  style={{ marginTop: 6, display: 'inline-flex' }}
                  href={`https://wa.me/55${motoboy.phone.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Icon name="whatsapp" size={14} /> WhatsApp do entregador
                </a>
              )}
              <OrderChat orderId={order.id} startOpen={autoOpenChat} />
            </div>
          )}

          {order.delivery_confirmation_code ? (
            <div className="section" style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12 }} className="muted">Código de confirmação de entrega</div>
              <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '0.1em' }}>
                {String(order.delivery_confirmation_code)}
              </div>
              <p className="muted" style={{ fontSize: 12, margin: '2px 0 8px' }}>
                O entregador vai pedir esse código ao cliente na hora de concluir a entrega. Avise o cliente com
                antecedência.
              </p>
              {order.customer_phone && (
                <a
                  className="button secondary"
                  style={{ width: 'auto', display: 'inline-block' }}
                  target="_blank"
                  rel="noreferrer"
                  href={`https://wa.me/${String(order.customer_phone).replace(/\D/g, '')}?text=${encodeURIComponent(
                    `Olá, ${order.customer_name}! Seu pedido saiu para entrega. Quando o entregador chegar, informe o código ${String(order.delivery_confirmation_code)} para confirmar o recebimento.`,
                  )}`}
                >
                  Enviar código pelo WhatsApp
                </a>
              )}
            </div>
          ) : null}

          <div className="card-title" style={{ marginTop: 14 }}>Pagamento da venda</div>
          {Number(order.order_amount) > 0 ? (
            <>
              <div style={{ fontSize: 14 }}>
                {formatCurrencyBRL(Number(order.order_amount))} a receber do cliente na entrega —{' '}
                {PAYMENT_METHOD_LABELS[order.payment_method as keyof typeof PAYMENT_METHOD_LABELS] ?? order.payment_method}
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                O entregador recolhe esse valor. O Leeva não processa a venda — o dinheiro é seu.
              </div>
            </>
          ) : (
            <div className="muted" style={{ fontSize: 13 }}>
              Venda já paga nos seus canais. O Leeva não toca no dinheiro da venda.
            </div>
          )}
        </div>

        <div>
          {ownFleet ? (
            <>
              <div className="card-title">Seu motoboy recebe</div>
              <div style={{ fontSize: 22, fontWeight: 650 }}>
                {order.driver_payout != null ? formatCurrencyBRL(Number(order.driver_payout)) : "a calcular"}
              </div>
              <div className="muted" style={{ fontSize: 12 }}>pela sua tabela — entra no acerto do motoboy</div>
            </>
          ) : (
            <>
              <div className="card-title">Custo desta entrega</div>
              <div style={{ fontSize: 22, fontWeight: 650 }}>
                {order.leeva_fee != null ? formatCurrencyBRL(Number(order.leeva_fee)) : 'a calcular'}
              </div>
              <div className="muted" style={{ fontSize: 12 }}>descontado do seu crédito</div>
            </>
          )}
          <table className="data" style={{ fontSize: 13, marginTop: 8 }}>
            <tbody>
              <tr><td>Distância</td><td>{order.route_distance_km != null ? `${Number(order.route_distance_km).toFixed(1)} km` : '—'}</td></tr>
            </tbody>
          </table>

          {groupPeers && groupPeers.length > 1 && (
            <div className="section" style={{ marginTop: 10, fontSize: 13 }}>
              <strong style={{ fontSize: 12 }}>Rota agrupada</strong>
              <p className="muted" style={{ fontSize: 12, margin: '4px 0 6px' }}>
                Um único entregador faz esta e mais {groupPeers.length - 1}{' '}
                {groupPeers.length - 1 === 1 ? 'entrega' : 'entregas'} na mesma saída. Por isso o custo acima
                é menor que o de uma entrega avulsa.
              </p>
              <ol style={{ margin: 0, paddingLeft: 18 }}>
                {groupPeers.map((p) => (
                  <li key={`${p.orderNumber}-${p.seq}`} style={{ fontWeight: p.orderNumber === order.order_number ? 700 : 400 }}>
                    {p.seq}ª parada — #{p.orderNumber} ({p.customerName})
                    {p.orderNumber === order.order_number ? ' — este pedido' : ''}
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className="card-title" style={{ marginTop: 14 }}>Despacho</div>
          <div style={{ fontSize: 14 }}>
            {['searching', 'offered'].includes(order.dispatch_state)
              ? DISPATCH_STATE_LABELS[order.dispatch_state]
              : order.motoboy_id
                ? ownFleet
                  ? 'Motoboy definido'
                  : 'Entregador atribuído automaticamente'
                : ownFleet
                  ? 'Esperando o próximo da fila'
                  : DISPATCH_STATE_LABELS[order.dispatch_state]}
          </div>
          {ownFleet && open && team && (
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              <select className="input" value={pick} onChange={(e) => setPick(e.target.value)} style={{ flex: 1, minWidth: 180 }}>
                <option value="">{order.motoboy_id ? 'Trocar motoboy…' : 'Escolher motoboy…'}</option>
                {team
                  .filter((m) => m.state !== 'offline' && m.id !== order.motoboy_id)
                  .sort((a, b) => (a.queuePos ?? 99) - (b.queuePos ?? 99))
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} — {m.queuePos ? `${m.queuePos}º na fila` : m.state === 'busy' ? `em entrega (${m.activeOrders})` : 'livre'}
                    </option>
                  ))}
              </select>
              <button
                className="btn sm primary"
                disabled={busy || !pick}
                onClick={() =>
                  void run(() =>
                    apiPost(`/api/orders/${order.id}/dispatch`, { motoboyId: pick, reassign: !!order.motoboy_id }),
                  ).then(() => setPick(''))
                }
              >
                {order.motoboy_id ? 'Trocar' : 'Mandar pra ele'}
              </button>
            </div>
          )}
          {ownFleet && open && team && team.every((m) => m.state === 'offline') && (
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Nenhum motoboy online agora.</div>
          )}
          {!ownFleet && !order.motoboy_id && ['none', 'searching'].includes(order.dispatch_state) && (
            <div style={{ marginTop: 8 }}>
              <button
                className="btn sm"
                disabled={busy}
                onClick={() => {
                  const v = window.prompt('Reforçar o valor pago ao motoboy nesta entrega em quanto (R$)? Ajuda a atrair alguém mais rápido se estiver demorando.');
                  const amount = v ? Number(v.replace(',', '.')) : NaN;
                  if (!Number.isFinite(amount) || amount <= 0) return;
                  void run(() => apiPost(`/api/orders/${order.id}/boost-payout`, { amount }));
                }}
              >
                Reforçar valor pro motoboy
              </button>
              {typeof o?.payout_boost === 'number' && o.payout_boost > 0 && (
                <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>
                  +{formatCurrencyBRL(o.payout_boost)} reforçado
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="card-title">Linha do tempo</div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {stamps.map(([label, iso]) => (
            <div key={label} style={{ fontSize: 12 }}>
              <div className="muted">{label}</div>
              <div>{iso ? formatDateTime(String(iso)) : '—'}</div>
            </div>
          ))}
        </div>
        <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none' }}>
          {(d?.timeline ?? []).map((e) => (
            <li key={e.id} className="muted" style={{ fontSize: 12 }}>
              {formatDateTime(e.created_at)} · {e.type}
            </li>
          ))}
        </ul>
      </div>

      {order.status === 'delivered' && (o?.delivery_gps_status as string | undefined) === 'external' && (
        <div>
          <div className="card-title">Conclusão</div>
          <div className="tag gray">Concluída no iFood — entrega feita por fora do Leeva</div>
        </div>
      )}

      {order.status === 'delivered' && (o?.delivery_gps_status as string | undefined) !== 'external' && (
        <div>
          <div className="card-title">Comprovante de entrega</div>
          {(() => {
            const gps = o?.delivery_gps_status as string | undefined;
            const dist = o?.delivery_distance_m as number | undefined;
            if (gps === 'ok') {
              return (
                <div className="tag green" style={{ marginBottom: 8 }}>
                  Confirmada no local{dist != null ? ` (${dist} m do endereço)` : ''}
                </div>
              );
            }
            if (gps === 'no_gps') {
              return (
                <div className="tag amber" style={{ marginBottom: 8 }}>
                  Confirmada sem localização (GPS do entregador indisponível)
                </div>
              );
            }
            return null;
          })()}
          {d?.deliveryPhotoUrl ? (
            <a href={d.deliveryPhotoUrl} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={d.deliveryPhotoUrl}
                alt="Foto da entrega"
                style={{ maxWidth: 280, borderRadius: 10, border: '1px solid var(--border)', display: 'block' }}
              />
            </a>
          ) : (
            <span className="muted" style={{ fontSize: 13 }}>Sem foto (entrega anterior a esta função).</span>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 13 }}>Rastreamento do cliente:</strong>
        {d?.trackingUrl ? (
          <a href={d.trackingUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>{d.trackingUrl}</a>
        ) : (
          <button
            className="btn sm"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const r = await apiPost<{ url: string }>(`/api/orders/${order.id}/tracking-link`);
                setD((x) => (x ? { ...x, trackingUrl: r.url } : x));
              })
            }
          >
            Gerar link
          </button>
        )}
      </div>

      {d?.notifications?.length ? (
        <div>
          <div className="card-title">Notificações</div>
          {d.notifications.map((n, i) => (
            <div key={i} className="muted" style={{ fontSize: 12 }}>
              [{n.channel}] {n.body} — <b>{n.status}</b>{n.error ? ` (${n.error})` : ''}
            </div>
          ))}
        </div>
      ) : null}

      {!['delivered', 'cancelled'].includes(order.status) && order.status !== 'waiting_dispatch' && (
        <div style={{ fontSize: 12 }} className="muted">
          Status atual: <b>{ORDER_STATUS_LABELS[order.status]}</b>. O restaurante não altera o status
          da entrega — isso é feito pelo entregador. Você pode cancelar o pedido se necessário.
        </div>
      )}

      {err && <div className="op-alert critical">{err}</div>}
    </div>
  );
}
