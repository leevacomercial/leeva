import Link from 'next/link';
import { notFound } from 'next/navigation';
import { adminDb } from '@/lib/context';
import { getRestaurantDetail } from '@leeva/shared/services';
import { money, num } from '../../_lib/ui';
import { SubscriptionActions } from './SubscriptionActions';

const STATUS_LABEL: Record<string, string> = {
  active: 'Em dia',
  trialing: 'Teste grátis',
  past_due: 'Inadimplente',
  canceled: 'Cancelado',
};
const DRIVER_STATUS: Record<string, string> = { available: 'livre', on_delivery: 'em entrega', offline: 'offline' };

export const dynamic = 'force-dynamic';

export default async function RestaurantDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await getRestaurantDetail(adminDb(), id);
  if (!d) notFound();

  const r = d.restaurant;
  const sub = d.subscription as
    | { status?: string; trial_ends_at?: string | null; current_period_end?: string; plans?: { code?: string; name?: string; monthly_price?: number } }
    | null;
  const lc = (r.logistics_config ?? {}) as Record<string, unknown>;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{r.name}</h1>
          <div className="sub">
            <Link href="/restaurantes">← Clientes</Link>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">Dados</div>
          <dl className="kv">
            <dt>Endereço</dt>
            <dd>{r.address ?? '—'}</dd>
            <dt>Telefone</dt>
            <dd>{r.phone ?? '—'}</dd>
            <dt>Coordenadas</dt>
            <dd>{r.latitude != null ? `${r.latitude}, ${r.longitude}` : '—'}</dd>
            <dt>Onboarding</dt>
            <dd>{r.onboarding_completed ? 'Concluído' : 'Pendente'}</dd>
            <dt>Cadastro</dt>
            <dd>{new Date(r.created_at).toLocaleString('pt-BR')}</dd>
            <dt>Volume esperado</dt>
            <dd>{r.expected_daily_orders != null ? `~${r.expected_daily_orders} pedidos/dia` : '— (não informado)'}</dd>
            <dt>Usuários do painel</dt>
            <dd>{d.team.map((u) => `${u.full_name ?? '—'} (${u.role})`).join(', ') || '—'}</dd>
          </dl>
        </div>

        <div className="card">
          <div className="card-title">Assinatura</div>
          {sub ? (
            <dl className="kv">
              <dt>Plano</dt>
              <dd>{sub.plans?.name ?? '—'}</dd>
              <dt>Situação</dt>
              <dd>{STATUS_LABEL[sub.status ?? ''] ?? sub.status}</dd>
              <dt>Mensalidade</dt>
              <dd>{money(sub.plans?.monthly_price)}</dd>
              {sub.status === 'trialing' ? (
                <>
                  <dt>Teste grátis até</dt>
                  <dd>{sub.trial_ends_at ? new Date(sub.trial_ends_at).toLocaleDateString('pt-BR') : '—'}</dd>
                </>
              ) : (
                <>
                  <dt>Pago até</dt>
                  <dd>{sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString('pt-BR') : '—'}</dd>
                </>
              )}
            </dl>
          ) : (
            <p className="muted">Sem assinatura ainda (é criada no primeiro acesso ao painel).</p>
          )}
          <SubscriptionActions
            restaurantId={id}
            status={sub?.status ?? null}
            planCode={sub?.plans?.code ?? null}
            plans={d.plans.map((p) => ({ code: p.code, name: p.name, monthly_price: Number(p.monthly_price) }))}
          />
        </div>
      </div>

      <div className="card">
        <div className="card-title">Utilização (últimos 30 dias)</div>
        <div className="stat-row">
          <div className="stat"><div className="v">{num(d.usage30d.delivered)}</div><div className="l">Entregas concluídas</div></div>
          <div className="stat"><div className="v">{num(d.usage30d.ordersCreated)}</div><div className="l">Pedidos criados</div></div>
          <div className="stat"><div className="v">{money(d.usage30d.driverCost)}</div><div className="l">Pago aos motoboys (acerto deles)</div></div>
          <div className="stat"><div className="v">{num(d.drivers.filter((m) => m.active).length)}</div><div className="l">Motoboys ativos na equipe</div></div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Equipe de motoboys</div>
        {d.drivers.length ? (
          <table className="tbl">
            <thead><tr><th>Nome</th><th>Telefone</th><th>Situação</th><th>App ativado</th><th style={{ textAlign: 'right' }}>Entregas</th></tr></thead>
            <tbody>
              {d.drivers.map((m) => (
                <tr key={m.id}>
                  <td>{m.full_name}{!m.active && <span className="tag gray" style={{ marginLeft: 6 }}>desativado</span>}</td>
                  <td>{m.phone}</td>
                  <td>{DRIVER_STATUS[m.status] ?? m.status}</td>
                  <td>{m.user_id ? 'sim' : 'não'}</td>
                  <td style={{ textAlign: 'right' }}>{num(m.deliveries_completed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">Nenhum motoboy cadastrado ainda.</p>
        )}
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">Configuração do restaurante</div>
          <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
            Só leitura — o próprio restaurante ajusta taxas, raio e despacho em Configurações.
          </p>
          <dl className="kv">
            {Object.entries(lc).map(([k, v]) => (
              <div key={k} style={{ display: 'contents' }}>
                <dt>{k}</dt>
                <dd>{v == null ? '—' : String(v)}</dd>
              </div>
            ))}
          </dl>
          {d.payoutPolicy && (
            <>
              <div className="card-title" style={{ marginTop: 12 }}>Quanto paga ao motoboy ({d.payoutPolicy.name})</div>
              <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{JSON.stringify(d.payoutPolicy.config, null, 2)}</pre>
            </>
          )}
        </div>

        <div className="card">
          <div className="card-title">Integrações</div>
          {d.integrations.length ? (
            <table className="tbl">
              <thead><tr><th>Provedor</th><th>Status</th><th>Credencial</th><th>Último evento</th></tr></thead>
              <tbody>
                {d.integrations.map((i) => (
                  <tr key={i.provider}>
                    <td>{i.provider}</td>
                    <td>{i.status}</td>
                    <td>{i.credentials_set ? 'sim' : 'não'}</td>
                    <td>{i.last_event_at ? new Date(i.last_event_at).toLocaleString('pt-BR') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted">Nenhuma integração configurada.</p>
          )}

          <div className="card-title" style={{ marginTop: 12 }}>Faturamento recente</div>
          {d.recentBilling.length ? (
            <table className="tbl">
              <thead><tr><th>Data</th><th>Tipo</th><th style={{ textAlign: 'right' }}>Valor</th><th>Descrição</th></tr></thead>
              <tbody>
                {d.recentBilling.map((b, i) => (
                  <tr key={i}>
                    <td>{new Date(b.created_at).toLocaleDateString('pt-BR')}</td>
                    <td>{b.type}</td>
                    <td style={{ textAlign: 'right' }}>{money(b.amount)}</td>
                    <td>{b.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted">Sem eventos de faturamento.</p>
          )}
        </div>
      </div>

      <p className="muted" style={{ fontSize: 12 }}>
        O admin visualiza a operação para suporte. O isolamento entre restaurantes e as permissões continuam valendo.
      </p>
    </>
  );
}
