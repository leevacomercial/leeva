import Link from 'next/link';
import { notFound } from 'next/navigation';
import { adminDb } from '@/lib/context';
import { getDriverPerformance, getReputationConfig } from '@leeva/shared/services';
import { pctText } from '../../_lib/ui';
import { BlockButton } from './BlockButton';
import { Icon } from '../../../_icons/Icon';

export const dynamic = 'force-dynamic';

const INCIDENT_LABEL: Record<string, string> = {
  decline_adequate_offer: 'Recusa de oferta adequada',
  cancel_after_accept: 'Cancelou após aceitar',
  abandon: 'Abandono',
  no_show: 'Não compareceu',
  late_delivery: 'Entrega atrasada',
  complaint: 'Reclamação',
};
const ORIGIN_LABEL: Record<string, string> = {
  driver: 'Entregador', restaurant: 'Restaurante', customer: 'Cliente', system: 'Sistema', unknown: '—',
};

function Bar({ value }: { value: number }) {
  return (
    <div className="bar" style={{ marginTop: 4 }}>
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export default async function DriverDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = adminDb();
  const perf = await getDriverPerformance(db, id);
  if (!perf) notFound();
  const cfg = await getReputationConfig(db);

  const { data: incidents } = await db
    .from('driver_incidents')
    .select('type, origin, severity, note, created_at, order_id')
    .eq('motoboy_id', id)
    .order('created_at', { ascending: false })
    .limit(40);

  const { data: offers } = await db
    .from('dispatch_attempts')
    .select('id, order_id, quality, quality_score, payout_estimate, distance_pickup_km, distance_total_km, outcome, counts_for_acceptance, offered_at')
    .eq('motoboy_id', id)
    .order('offered_at', { ascending: false })
    .limit(25);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{perf.name}</h1>
          <div className="sub">
            <Link href="/entregadores">← Motoboys</Link>
            {perf.blocked && <span className="tag red" style={{ marginLeft: 8 }}>bloqueado: {perf.blockedReason}</span>}
          </div>
        </div>
        <BlockButton motoboyId={id} blocked={perf.blocked} />
      </div>

      <div className="card">
        <div className="card-title">Desempenho</div>
        <div className="stat-row">
          <div className="stat"><div className="v" style={{ display: 'flex', gap: 5, alignItems: 'center', justifyContent: 'center' }}><Icon name="star" size={16} /> {perf.rating.toFixed(1)}</div><div className="l">Avaliação</div></div>
          <div className="stat"><div className="v">{pctText(Math.round(perf.acceptanceRate))}</div><div className="l">Aceitação de ofertas adequadas</div></div>
          <div className="stat"><div className="v">{pctText(Math.round(perf.completionRate))}</div><div className="l">Finalização</div></div>
          <div className="stat"><div className="v">{pctText(Math.round(perf.punctualityRate))}</div><div className="l">Pontualidade</div></div>
          <div className="stat good"><div className="v">{Math.round(perf.reliabilityIndex)}</div><div className="l">Índice de confiabilidade</div></div>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>{perf.explanation}</p>
        <div style={{ marginTop: 10, maxWidth: 420 }}>
          {Object.entries(perf.components).map(([k, v]) => (
            <div key={k} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span>{k} <span className="muted">(peso {(cfg.weights as Record<string, number>)[k] ?? '?'})</span></span>
                <span>{Math.round(v)}</span>
              </div>
              <Bar value={v} />
            </div>
          ))}
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          Amostra: {perf.sample.offersAdequate} ofertas adequadas · {perf.sample.deliveriesTotal} entregas · {perf.sample.deliveriesCompleted} concluídas
        </p>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">Histórico de ofertas</div>
          <table className="tbl">
            <thead><tr><th>Qualidade</th><th style={{ textAlign: 'right' }}>Valor</th><th style={{ textAlign: 'right' }}>Dist.</th><th>Resultado</th><th>Conta p/ aceitação?</th></tr></thead>
            <tbody>
              {(offers ?? []).map((o) => (
                <tr key={o.id}>
                  <td>
                    <span className={`tag ${o.quality === 'excellent' ? 'green' : o.quality === 'good' ? 'blue' : o.quality === 'acceptable' ? 'amber' : 'gray'}`}>
                      {o.quality ?? '—'} {o.quality_score != null ? `(${Math.round(Number(o.quality_score))})` : ''}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>{o.payout_estimate != null ? `R$ ${Number(o.payout_estimate).toFixed(2)}` : '—'}</td>
                  <td style={{ textAlign: 'right' }}>{o.distance_total_km != null ? `${Number(o.distance_total_km).toFixed(1)} km` : '—'}</td>
                  <td>{o.outcome ?? 'aberta'}</td>
                  <td>{o.counts_for_acceptance ? 'sim' : 'não'}</td>
                </tr>
              ))}
              {(offers ?? []).length === 0 && <tr><td colSpan={5} className="muted">Sem ofertas.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-title">Incidentes (registro + origem)</div>
          <table className="tbl">
            <thead><tr><th>Data</th><th>Tipo</th><th>Origem</th><th>Nota</th></tr></thead>
            <tbody>
              {(incidents ?? []).map((i, idx) => (
                <tr key={idx}>
                  <td>{new Date(i.created_at).toLocaleDateString('pt-BR')}</td>
                  <td>{INCIDENT_LABEL[i.type] ?? i.type}</td>
                  <td>
                    <span className={`tag ${i.origin === 'driver' ? 'red' : 'gray'}`}>{ORIGIN_LABEL[i.origin] ?? i.origin}</span>
                  </td>
                  <td>{i.note ?? '—'}</td>
                </tr>
              ))}
              {(incidents ?? []).length === 0 && <tr><td colSpan={4} className="muted">Nenhum incidente.</td></tr>}
            </tbody>
          </table>
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            Só incidentes com origem &quot;Entregador&quot; pesam no índice. Problema do restaurante, cliente ou sistema fica só como registro.
          </p>
        </div>
      </div>
    </>
  );
}
