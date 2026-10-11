import Link from 'next/link';
import { requireRestaurantContext, adminDb } from '@/lib/context';
import { getUsageSummary, getOwnFleetSettlement, type Period } from '@leeva/shared/services';
import { formatCurrencyBRL } from '@leeva/shared';

export const dynamic = 'force-dynamic';

const PERIODS: { k: Period; l: string }[] = [
  { k: 'today', l: 'Hoje' },
  { k: 'yesterday', l: 'Ontem' },
  { k: '7d', l: '7 dias' },
  { k: '30d', l: '30 dias' },
];

export default async function FinanceiroPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const ctx = await requireRestaurantContext();
  const db = adminDb();
  const sp = await searchParams;
  const period = (PERIODS.find((p) => p.k === sp.period)?.k ?? '30d') as Period;

  const [saas, acerto] = await Promise.all([
    getUsageSummary(db, ctx.restaurantId),
    getOwnFleetSettlement(db, ctx.restaurantId, period),
  ]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Financeiro</h1>
          <div className="sub">Sua mensalidade do Leeva e o acerto com cada motoboy da equipe.</div>
        </div>
        <div className="seg">
          {PERIODS.map((p) => (
            <Link key={p.k} href={`/financeiro?period=${p.k}`} className={p.k === period ? 'active' : ''}>
              {p.l}
            </Link>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-title">Seu plano Leeva — {saas.plan.name}</div>
        <div className="stat-row">
          <div className="stat"><div className="v">{formatCurrencyBRL(saas.monthlyFee)}</div><div className="l">mensalidade</div></div>
          <div className="stat"><div className="v">{saas.deliveries}</div><div className="l">entregas no período</div></div>
          {saas.plan.perDeliveryPrice > 0 && (
            <div className="stat"><div className="v">{formatCurrencyBRL(saas.variableFee)}</div><div className="l">variável ({saas.deliveries} × {formatCurrencyBRL(saas.plan.perDeliveryPrice)})</div></div>
          )}
          <div className="stat good"><div className="v">{formatCurrencyBRL(saas.estimatedTotal)}</div><div className="l">total do mês</div></div>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          {saas.status === 'trialing' && saas.trialEndsAt
            ? `Em teste grátis até ${new Date(saas.trialEndsAt).toLocaleDateString('pt-BR')}.`
            : `Período: ${new Date(saas.periodStart).toLocaleDateString('pt-BR')} – ${new Date(saas.periodEnd).toLocaleDateString('pt-BR')}.`}{' '}
          <Link href="/configuracoes#plano">Ver planos</Link>
        </p>
      </div>

      <div className="card">
          <div className="card-title">Acerto dos motoboys — {acerto.period}</div>
          <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
            Quanto você paga a cada um pelas entregas feitas, já descontando o dinheiro vivo que ele recebeu dos clientes.
          </p>
          {acerto.drivers.length === 0 ? (
            <p className="muted">Nenhuma entrega da sua equipe no período.</p>
          ) : (
            <table className="data">
              <thead>
                <tr><th>Motoboy</th><th>Entregas</th><th>Km</th><th>A pagar</th><th>Dinheiro com ele</th><th>Acerto</th></tr>
              </thead>
              <tbody>
                {acerto.drivers.map((d) => (
                  <tr key={d.motoboyId}>
                    <td>{d.name}</td>
                    <td>{d.deliveries}</td>
                    <td>{d.km.toFixed(1)}</td>
                    <td>{formatCurrencyBRL(d.toPay)}</td>
                    <td>{d.cashCollected > 0 ? formatCurrencyBRL(d.cashCollected) : '—'}</td>
                    <td>
                      <strong>
                        {d.balance >= 0
                          ? `você paga ${formatCurrencyBRL(d.balance)}`
                          : `ele devolve ${formatCurrencyBRL(-d.balance)}`}
                      </strong>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td><strong>Total</strong></td>
                  <td>{acerto.totals.deliveries}</td>
                  <td>{acerto.totals.km.toFixed(1)}</td>
                  <td>{formatCurrencyBRL(acerto.totals.toPay)}</td>
                  <td>{acerto.totals.cashCollected > 0 ? formatCurrencyBRL(acerto.totals.cashCollected) : '—'}</td>
                  <td>
                    <strong>{formatCurrencyBRL(acerto.totals.balance)}</strong>
                  </td>
                </tr>
              </tbody>
            </table>
          )}
          {acerto.totals.customerFees > 0 && (
            <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              Taxas de entrega cobradas dos clientes no período: {formatCurrencyBRL(acerto.totals.customerFees)}.
            </p>
          )}
      </div>
    </>
  );
}
