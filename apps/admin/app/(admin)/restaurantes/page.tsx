import Link from 'next/link';
import { adminDb } from '@/lib/context';
import { listRestaurants, type AdminRestaurantRow } from '@leeva/shared/services';
import { StatCard, money, num } from '../_lib/ui';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  active: 'Em dia',
  trialing: 'Teste grátis',
  past_due: 'Inadimplente',
  canceled: 'Cancelado',
};

const DAY = 86_400_000;

/** Situação da cobrança, olhando a data: "vence em 3 dias", "venceu há 2 dias"… */
function dueInfo(r: AdminRestaurantRow, now: number): { text: string; tone: 'ok' | 'warn' | 'danger' | 'muted' } {
  if (r.status === 'canceled' || !r.dueAt) return { text: '—', tone: 'muted' };
  const days = Math.ceil((new Date(r.dueAt).getTime() - now) / DAY);
  const date = new Date(r.dueAt).toLocaleDateString('pt-BR');
  const what = r.status === 'trialing' ? 'teste acaba' : 'vence';
  const whatPast = r.status === 'trialing' ? 'teste acabou' : 'venceu';
  if (days < 0) return { text: `${whatPast} há ${-days} dia${days === -1 ? '' : 's'} (${date})`, tone: 'danger' };
  if (days === 0) return { text: `${what} hoje`, tone: 'warn' };
  if (days <= 7) return { text: `${what} em ${days} dia${days === 1 ? '' : 's'} (${date})`, tone: 'warn' };
  return { text: `${what} em ${date}`, tone: 'ok' };
}

/** Quem precisa de atenção do admin agora: cobrança vencida / teste acabado / vencendo. */
function needsAction(r: AdminRestaurantRow, now: number): boolean {
  if (r.status === 'past_due') return true;
  if (r.status === 'canceled' || !r.dueAt) return false;
  return new Date(r.dueAt).getTime() - now <= 7 * DAY;
}

export default async function Clientes({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  const all = await listRestaurants(adminDb());
  const now = Date.now();

  const filter = sp.status ?? '';
  const rows =
    filter === 'action'
      ? all.filter((r) => needsAction(r, now))
      : filter
        ? all.filter((r) => r.status === filter)
        : all;

  const active = all.filter((r) => r.status === 'active');
  const trial = all.filter((r) => r.status === 'trialing');
  const late = all.filter((r) => r.status === 'past_due');
  const action = all.filter((r) => needsAction(r, now));
  const mrr = active.reduce((s, r) => s + r.monthlyPrice, 0);

  const filters: [string, string][] = [
    ['', 'Todos'],
    ['action', `Cobrar / atenção (${action.length})`],
    ['active', 'Em dia'],
    ['trialing', 'Teste grátis'],
    ['past_due', 'Inadimplentes'],
    ['canceled', 'Cancelados'],
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Clientes</h1>
          <div className="sub">Assinaturas e cobrança — a cobrança é feita por fora (Pix/boleto) e marcada aqui.</div>
        </div>
      </div>

      <div className="card">
        <div className="stat-row">
          <StatCard label="Receita mensal (clientes em dia)" value={money(mrr)} />
          <StatCard label="Clientes em dia" value={num(active.length)} />
          <StatCard label="Em teste grátis" value={num(trial.length)} />
          <StatCard label="Inadimplentes" value={num(late.length)} />
          <StatCard label="Pra cobrar nos próximos 7 dias" value={num(action.length)} />
        </div>
      </div>

      <div className="seg" style={{ margin: '12px 0', flexWrap: 'wrap' }}>
        {filters.map(([v, l]) => (
          <Link key={v} href={v ? `/restaurantes?status=${v}` : '/restaurantes'} className={`seg-btn ${filter === v ? 'active' : ''}`}>
            {l}
          </Link>
        ))}
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Plano</th>
              <th>Situação</th>
              <th>Cobrança</th>
              <th style={{ textAlign: 'right' }}>Mensalidade</th>
              <th style={{ textAlign: 'right' }}>Motoboys</th>
              <th style={{ textAlign: 'right' }}>Entregas 30d</th>
              <th>Última entrega</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const due = dueInfo(r, now);
              return (
                <tr key={r.id}>
                  <td>
                    <Link href={`/restaurantes/${r.id}`}>{r.name}</Link>
                    {!r.onboardingCompleted && <span className="tag gray" style={{ marginLeft: 6 }}>cadastro incompleto</span>}
                  </td>
                  <td>{r.plan ?? '—'}</td>
                  <td>
                    <span className={`tag ${r.status === 'active' ? 'green' : r.status === 'trialing' ? 'blue' : r.status === 'past_due' ? 'amber' : 'gray'}`}>
                      {STATUS_LABEL[r.status ?? ''] ?? r.status ?? '—'}
                    </span>
                  </td>
                  <td
                    style={{
                      color: due.tone === 'danger' ? 'var(--danger)' : due.tone === 'warn' ? 'var(--warn)' : due.tone === 'muted' ? 'var(--muted)' : undefined,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {due.text}
                  </td>
                  <td style={{ textAlign: 'right' }}>{money(r.monthlyPrice)}</td>
                  <td style={{ textAlign: 'right' }}>{num(r.teamSize)}</td>
                  <td style={{ textAlign: 'right' }}>{num(r.deliveries30d)}</td>
                  <td>{r.lastActivityAt ? new Date(r.lastActivityAt).toLocaleDateString('pt-BR') : '—'}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="muted">Nenhum cliente nesse filtro.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
