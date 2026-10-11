import Link from 'next/link';
import { adminDb } from '@/lib/context';
import { getAdminOverview, type AdminPeriod } from '@leeva/shared/services';
import { StatCard, PeriodNav, money, num } from '../_lib/ui';

export const dynamic = 'force-dynamic';

const PERIODS: AdminPeriod[] = ['today', '7d', '30d', 'month'];

export default async function VisaoGeral({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const sp = await searchParams;
  const period: AdminPeriod = PERIODS.includes(sp.p as AdminPeriod) ? (sp.p as AdminPeriod) : '30d';
  const o = await getAdminOverview(adminDb(), period);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Visão geral</h1>
          <div className="sub">O que está acontecendo na plataforma</div>
        </div>
        <PeriodNav base="/visao-geral" current={period} />
      </div>

      {(() => {
        const h = o.dispatchHealth;
        const color = h.status === 'ok' ? 'var(--ok)' : h.status === 'warn' ? 'var(--warn)' : 'var(--danger)';
        const dotClass = h.status === 'ok' ? 'ok' : h.status === 'warn' ? 'warn' : 'danger';
        return (
          <div className="card" style={{ borderLeft: `3px solid ${color}` }}>
            <div className="card-title">Motor de despacho</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 15, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <span className={`dot ${dotClass}`} />
                {h.secondsSinceLastRun == null
                  ? 'sem execução'
                  : h.secondsSinceLastRun < 90
                    ? `última execução há ${h.secondsSinceLastRun}s`
                    : `última execução há ${Math.round(h.secondsSinceLastRun / 60)} min`}
              </span>
              <span className="muted" style={{ fontSize: 13 }}>
                {h.runsLastHour} execuções na última hora
                {h.errorsLastHour > 0 ? ` · ${h.errorsLastHour} com erro` : ''}
                {h.avgDurationMs ? ` · ~${h.avgDurationMs} ms/exec` : ''}
              </span>
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{h.message}</div>
          </div>
        );
      })()}

      <div className="card">
        <div className="card-title">Receita <Link href="/restaurantes?status=action" style={{ fontSize: 12, fontWeight: 400, marginLeft: 8 }}>ver quem cobrar →</Link></div>
        <div className="stat-row">
          <StatCard label="Receita mensal (clientes em dia)" value={money(o.mrr)} />
          <StatCard label="Mensalidades recebidas (período)" value={money(o.saasRevenue)} delta={o.deltas.saasRevenue} />
        </div>
      </div>

      <div className="card">
        <div className="card-title">Operação</div>
        <div className="stat-row">
          <StatCard label="Clientes em dia" value={num(o.restaurantsActive)} />
          <StatCard label="Clientes em teste grátis" value={num(o.restaurantsTrial)} />
          <StatCard label="Entregas hoje" value={num(o.deliveriesToday)} delta={o.deltas.deliveries} />
          <StatCard label="Entregas nos últimos 7 dias" value={num(o.deliveries7d)} />
          <StatCard label="Motoboys cadastrados" value={num(o.motoboysRegistered)} />
          <StatCard label="Motoboys online" value={num(o.motoboysOnline)} />
          <StatCard label="Entregas sem entregador" value={num(o.deliveriesNoDriver)} hint="dispatch_state = failed" />
        </div>
      </div>
    </>
  );
}
