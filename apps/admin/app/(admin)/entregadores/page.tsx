import Link from 'next/link';
import { adminDb } from '@/lib/context';
import { listDrivers } from '@leeva/shared/services';
import { num, pctText } from '../_lib/ui';
import { Icon } from '../../_icons/Icon';

export const dynamic = 'force-dynamic';

const waLink = (phone: string | null) => {
  const d = (phone ?? '').replace(/\D/g, '');
  return d ? `https://wa.me/${d.startsWith('55') ? d : '55' + d}` : null;
};

const STATUS: Record<string, string> = { offline: 'Offline', available: 'Disponível', on_delivery: 'Em entrega' };

export default async function Entregadores({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  const db = adminDb();
  const { rows, totals } = await listDrivers(db, { fleet: 'own', status: sp.status });
  const restIds = [...new Set(rows.map((m) => m.restaurantId).filter((x): x is string => !!x))];
  const { data: rests } = restIds.length
    ? await db.from('restaurants').select('id, name').in('id', restIds)
    : { data: [] as { id: string; name: string }[] };
  const restName = new Map((rests ?? []).map((r) => [r.id, r.name]));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Motoboys</h1>
          <div className="sub">As equipes de todos os clientes — pra suporte. Cada restaurante gerencia a sua.</div>
        </div>
      </div>

      <div className="stat-row">
        <div className="stat"><div className="v">{num(totals.total)}</div><div className="l">Total</div></div>
        <div className="stat good"><div className="v">{num(totals.online)}</div><div className="l">Online</div></div>
        <div className="stat"><div className="v">{num(totals.offline)}</div><div className="l">Offline</div></div>
        <div className="stat"><div className="v">{num(totals.onDelivery)}</div><div className="l">Em entrega</div></div>
        <div className="stat"><div className="v">{num(totals.available)}</div><div className="l">Disponíveis</div></div>
        <div className="stat warn"><div className="v">{num(totals.blocked)}</div><div className="l">Bloqueados</div></div>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Nome</th>
              <th>WhatsApp</th>
              <th>Restaurante</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Entregas</th>
              <th style={{ textAlign: 'right' }}>Aceitação</th>
              <th style={{ textAlign: 'right' }}>Finalização</th>
              <th style={{ textAlign: 'right' }}>Pontualidade</th>
              <th style={{ textAlign: 'right' }}>Avaliação</th>
              <th style={{ textAlign: 'right' }}>Confiabilidade</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id}>
                <td>
                  <Link href={`/entregadores/${m.id}`}>{m.name}</Link>
                  {m.blocked && <span className="tag red" style={{ marginLeft: 6 }}>bloqueado</span>}
                </td>
                <td>
                  {waLink(m.phone) ? (
                    <a href={waLink(m.phone)!} target="_blank" rel="noreferrer"><Icon name="whatsapp" size={12} /> {m.phone}</a>
                  ) : '—'}
                </td>
                <td>{m.restaurantId ? (restName.get(m.restaurantId) ?? '—') : '—'}</td>
                <td>{STATUS[m.status] ?? m.status}</td>
                <td style={{ textAlign: 'right' }}>{num(m.deliveriesTotal)}</td>
                <td style={{ textAlign: 'right' }}>{pctText(Math.round(m.acceptanceRate))}</td>
                <td style={{ textAlign: 'right' }}>{pctText(Math.round(m.completionRate))}</td>
                <td style={{ textAlign: 'right' }}>{pctText(Math.round(m.punctualityRate))}</td>
                <td style={{ textAlign: 'right' }}>{m.rating.toFixed(1)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: m.reliabilityIndex < 50 ? 'var(--danger)' : m.reliabilityIndex < 70 ? 'var(--warn)' : 'var(--ok)' }}>
                  {Math.round(m.reliabilityIndex)}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={10} className="muted">Nenhum entregador.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
