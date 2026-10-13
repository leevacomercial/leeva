import Link from 'next/link';
import { requireRestaurantContext, adminDb } from '@/lib/context';
import { formatCurrencyBRL, PAYMENT_METHOD_LABELS, ORDER_STATUS_LABELS, type PaymentMethod } from '@leeva/shared';
import { ExportCsv } from './ExportCsv';

export const dynamic = 'force-dynamic';

/**
 * INDICADORES — o relatório da logística da loja, com filtro por data,
 * motoboy, forma de pagamento, situação e bairro. Responde as perguntas do
 * dia a dia: quantas entregas, quanto cada motoboy tem a receber, quanto
 * dinheiro está com cada um, quanto entrou de taxa, em que bairro, quanto
 * tempo leva. Tudo exportável pra planilha.
 */

type SP = { de?: string; ate?: string; motoboy?: string; pagamento?: string; situacao?: string; bairro?: string };

const TZ = '-03:00'; // João Pessoa
const ymd = (d: Date) => new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
const COLLECT: PaymentMethod[] = ['cash', 'card_on_delivery', 'pix'];
const LIMIT = 3000;

export default async function IndicadoresPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireRestaurantContext();
  const db = adminDb();
  const sp = await searchParams;

  const today = ymd(new Date());
  const de = /^\d{4}-\d{2}-\d{2}$/.test(sp.de ?? '') ? sp.de! : ymd(new Date(Date.now() - 6 * 864e5));
  const ate = /^\d{4}-\d{2}-\d{2}$/.test(sp.ate ?? '') ? sp.ate! : today;
  const situacao = ['entregues', 'canceladas', 'andamento', 'todas'].includes(sp.situacao ?? '') ? sp.situacao! : 'todas';
  const pagamento = sp.pagamento && sp.pagamento in PAYMENT_METHOD_LABELS ? (sp.pagamento as PaymentMethod) : '';
  const bairro = (sp.bairro ?? '').trim().slice(0, 60);

  const { data: team } = await db
    .from('motoboys')
    .select('id, full_name')
    .eq('restaurant_id', ctx.restaurantId)
    .order('full_name');
  const nameOf = new Map((team ?? []).map((m) => [m.id, m.full_name]));
  const motoboy = sp.motoboy && nameOf.has(sp.motoboy) ? sp.motoboy : '';

  let q = db
    .from('orders')
    .select(
      'id, order_number, customer_name, customer_address, region, status, payment_method, payment_status, order_amount, delivery_fee, driver_payout, motoboy_id, created_at, delivered_at, route_distance_km, source',
    )
    .eq('restaurant_id', ctx.restaurantId)
    .gte('created_at', `${de}T00:00:00${TZ}`)
    .lte('created_at', `${ate}T23:59:59${TZ}`)
    .order('created_at', { ascending: false })
    .limit(LIMIT);
  if (motoboy) q = q.eq('motoboy_id', motoboy);
  if (pagamento) q = q.eq('payment_method', pagamento);
  if (situacao === 'entregues') q = q.eq('status', 'delivered');
  else if (situacao === 'canceladas') q = q.eq('status', 'cancelled');
  else if (situacao === 'andamento') q = q.not('status', 'in', '(delivered,cancelled)');
  if (bairro) q = q.ilike('region', `%${bairro}%`);
  const { data } = await q;
  const rows = data ?? [];

  const delivered = rows.filter((o) => o.status === 'delivered');
  const cancelled = rows.filter((o) => o.status === 'cancelled');
  const sum = (list: typeof rows, f: (o: (typeof rows)[number]) => number) => list.reduce((s, o) => s + f(o), 0);
  const minutes = (o: (typeof rows)[number]) =>
    o.delivered_at ? (new Date(o.delivered_at).getTime() - new Date(o.created_at).getTime()) / 60000 : null;
  const times = delivered.map(minutes).filter((m): m is number => m != null && m >= 0 && m < 600);
  const avgMin = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null;
  const collected = (o: (typeof rows)[number]) =>
    o.status === 'delivered' && COLLECT.includes(o.payment_method) && o.payment_status !== 'paid' ? Number(o.order_amount ?? 0) : 0;

  // por motoboy
  const byDriver = new Map<string, { name: string; n: number; pay: number; cash: number; mins: number[] }>();
  for (const o of delivered) {
    const id = o.motoboy_id ?? '—';
    const e = byDriver.get(id) ?? { name: o.motoboy_id ? nameOf.get(o.motoboy_id) ?? 'Motoboy' : 'Sem motoboy', n: 0, pay: 0, cash: 0, mins: [] };
    e.n += 1;
    e.pay += Number(o.driver_payout ?? 0);
    e.cash += collected(o);
    const m = minutes(o);
    if (m != null && m >= 0 && m < 600) e.mins.push(m);
    byDriver.set(id, e);
  }
  // por forma de pagamento
  const byPay = new Map<string, { n: number; total: number }>();
  for (const o of delivered) {
    const e = byPay.get(o.payment_method) ?? { n: 0, total: 0 };
    e.n += 1;
    e.total += Number(o.order_amount ?? 0);
    byPay.set(o.payment_method, e);
  }
  // por bairro
  const byRegion = new Map<string, { n: number; fee: number; pay: number }>();
  for (const o of delivered) {
    const k = o.region?.trim() || 'Sem bairro';
    const e = byRegion.get(k) ?? { n: 0, fee: 0, pay: 0 };
    e.n += 1;
    e.fee += Number(o.delivery_fee ?? 0);
    e.pay += Number(o.driver_payout ?? 0);
    byRegion.set(k, e);
  }

  const csvRows = rows.map((o) => ({
    data: new Date(o.created_at).toLocaleString('pt-BR', { timeZone: 'America/Recife' }),
    pedido: o.order_number ?? '',
    cliente: o.customer_name,
    bairro: o.region ?? '',
    endereco: o.customer_address,
    motoboy: o.motoboy_id ? nameOf.get(o.motoboy_id) ?? '' : '',
    situacao: ORDER_STATUS_LABELS[o.status] ?? o.status,
    pagamento: PAYMENT_METHOD_LABELS[o.payment_method] ?? o.payment_method,
    valor_pedido: Number(o.order_amount ?? 0).toFixed(2).replace('.', ','),
    taxa_cliente: Number(o.delivery_fee ?? 0).toFixed(2).replace('.', ','),
    motoboy_recebe: o.driver_payout != null ? Number(o.driver_payout).toFixed(2).replace('.', ',') : '',
    minutos: minutes(o) != null ? Math.round(minutes(o)!) : '',
  }));

  const qs = (patch: Partial<SP>) => {
    const p = new URLSearchParams({ de, ate, ...(motoboy ? { motoboy } : {}), ...(pagamento ? { pagamento } : {}), situacao, ...(bairro ? { bairro } : {}), ...patch } as Record<string, string>);
    return `/indicadores?${p.toString()}`;
  };

  return (
    <div className="grid" style={{ gap: 18 }}>
      <div className="spread">
        <div className="row" style={{ alignItems: 'baseline', gap: 12 }}>
          <h1 style={{ margin: 0 }}>Indicadores</h1>
          <Link href="/mapa" className="muted" style={{ fontSize: 13 }}>Mapa de calor →</Link>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <Link className="badge" href={qs({ de: today, ate: today })}>Hoje</Link>
          <Link className="badge" href={qs({ de: ymd(new Date(Date.now() - 864e5)), ate: ymd(new Date(Date.now() - 864e5)) })}>Ontem</Link>
          <Link className="badge" href={qs({ de: ymd(new Date(Date.now() - 6 * 864e5)), ate: today })}>7 dias</Link>
          <Link className="badge" href={qs({ de: ymd(new Date(Date.now() - 29 * 864e5)), ate: today })}>30 dias</Link>
        </div>
      </div>

      {/* filtros: formulário GET, funciona sem JavaScript */}
      <form className="panel report-filters" method="get" action="/indicadores">
        <label>De<input className="input" type="date" name="de" defaultValue={de} /></label>
        <label>Até<input className="input" type="date" name="ate" defaultValue={ate} /></label>
        <label>
          Motoboy
          <select className="input" name="motoboy" defaultValue={motoboy}>
            <option value="">Todos</option>
            {(team ?? []).map((m) => (
              <option key={m.id} value={m.id}>{m.full_name}</option>
            ))}
          </select>
        </label>
        <label>
          Pagamento
          <select className="input" name="pagamento" defaultValue={pagamento}>
            <option value="">Todos</option>
            {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).filter((k) => k !== 'unknown' && k !== 'other').map((k) => (
              <option key={k} value={k}>{PAYMENT_METHOD_LABELS[k]}</option>
            ))}
          </select>
        </label>
        <label>
          Situação
          <select className="input" name="situacao" defaultValue={situacao}>
            <option value="todas">Todas</option>
            <option value="entregues">Entregues</option>
            <option value="canceladas">Canceladas</option>
            <option value="andamento">Em andamento</option>
          </select>
        </label>
        <label>Bairro<input className="input" name="bairro" placeholder="ex.: Bessa" defaultValue={bairro} /></label>
        <div style={{ display: 'flex', gap: 6, alignItems: 'end' }}>
          <button className="btn primary" type="submit">Filtrar</button>
          <Link className="btn" href="/indicadores">Limpar</Link>
        </div>
      </form>

      <section className="cards">
        <Kpi label="entregas feitas" value={delivered.length} />
        <Kpi label="canceladas" value={cancelled.length} />
        <Kpi label="vendido (entregues)" value={formatCurrencyBRL(sum(delivered, (o) => Number(o.order_amount ?? 0)))} />
        <Kpi label="taxas de entrega" value={formatCurrencyBRL(sum(delivered, (o) => Number(o.delivery_fee ?? 0)))} />
        <Kpi label="a pagar aos motoboys" value={formatCurrencyBRL(sum(delivered, (o) => Number(o.driver_payout ?? 0)))} />
        <Kpi label="recebido na entrega (com os motoboys)" value={formatCurrencyBRL(sum(delivered, collected))} />
        <Kpi label="tempo médio (pedido → entregue)" value={avgMin != null ? `${avgMin} min` : '—'} />
      </section>

      <div className="report-grid">
        <section className="panel">
          <h2 style={{ fontSize: 15, marginTop: 0 }}>Por motoboy</h2>
          {byDriver.size ? (
            <table className="data">
              <thead>
                <tr><th>Motoboy</th><th>Entregas</th><th>A receber</th><th>Dinheiro com ele</th><th>Tempo médio</th></tr>
              </thead>
              <tbody>
                {[...byDriver.entries()].sort((a, b) => b[1].n - a[1].n).map(([id, d]) => (
                  <tr key={id}>
                    <td>{id !== '—' ? <Link href={qs({ motoboy: id })}>{d.name}</Link> : d.name}</td>
                    <td>{d.n}</td>
                    <td>{formatCurrencyBRL(d.pay)}</td>
                    <td>{formatCurrencyBRL(d.cash)}</td>
                    <td>{d.mins.length ? `${Math.round(d.mins.reduce((a, b) => a + b, 0) / d.mins.length)} min` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted">Sem entregas no filtro.</p>
          )}
          <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
            &quot;Dinheiro com ele&quot; = pedidos em dinheiro, cartão ou Pix na entrega que ele recebeu do cliente.
            O acerto do dia fica em <Link href="/financeiro">Acerto e financeiro</Link>.
          </p>
        </section>

        <section className="panel">
          <h2 style={{ fontSize: 15, marginTop: 0 }}>Por forma de pagamento</h2>
          {byPay.size ? (
            <table className="data">
              <thead><tr><th>Pagamento</th><th>Pedidos</th><th>Valor</th></tr></thead>
              <tbody>
                {[...byPay.entries()].sort((a, b) => b[1].total - a[1].total).map(([k, v]) => (
                  <tr key={k}>
                    <td><Link href={qs({ pagamento: k })}>{PAYMENT_METHOD_LABELS[k as PaymentMethod] ?? k}</Link></td>
                    <td>{v.n}</td>
                    <td>{formatCurrencyBRL(v.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted">Sem entregas no filtro.</p>
          )}
        </section>

        <section className="panel">
          <h2 style={{ fontSize: 15, marginTop: 0 }}>Por bairro</h2>
          {byRegion.size ? (
            <table className="data">
              <thead><tr><th>Bairro</th><th>Entregas</th><th>Taxas</th><th>Motoboys</th></tr></thead>
              <tbody>
                {[...byRegion.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 30).map(([k, v]) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td>{v.n}</td>
                    <td>{formatCurrencyBRL(v.fee)}</td>
                    <td>{formatCurrencyBRL(v.pay)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted">Sem entregas no filtro.</p>
          )}
        </section>
      </div>

      <section className="panel">
        <div className="spread" style={{ marginBottom: 8 }}>
          <h2 style={{ fontSize: 15, margin: 0 }}>Pedidos ({rows.length}{rows.length === LIMIT ? '+' : ''})</h2>
          <ExportCsv rows={csvRows} filename={`leeva-pedidos-${de}-a-${ate}.csv`} />
        </div>
        {rows.length ? (
          <div style={{ overflowX: 'auto' }}>
            <table className="data" style={{ fontSize: 13 }}>
              <thead>
                <tr><th>Data</th><th>#</th><th>Cliente</th><th>Bairro</th><th>Motoboy</th><th>Pagamento</th><th>Pedido</th><th>Taxa</th><th>Motoboy recebe</th><th>Situação</th></tr>
              </thead>
              <tbody>
                {rows.slice(0, 300).map((o) => (
                  <tr key={o.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{new Date(o.created_at).toLocaleString('pt-BR', { timeZone: 'America/Recife', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                    <td>{o.order_number ?? '—'}</td>
                    <td>{o.customer_name}</td>
                    <td>{o.region ?? '—'}</td>
                    <td>{o.motoboy_id ? nameOf.get(o.motoboy_id) ?? '—' : '—'}</td>
                    <td>{PAYMENT_METHOD_LABELS[o.payment_method] ?? o.payment_method}{o.payment_status === 'paid' ? ' (pago)' : ''}</td>
                    <td>{formatCurrencyBRL(Number(o.order_amount ?? 0))}</td>
                    <td>{formatCurrencyBRL(Number(o.delivery_fee ?? 0))}</td>
                    <td>{o.driver_payout != null ? formatCurrencyBRL(Number(o.driver_payout)) : '—'}</td>
                    <td>{ORDER_STATUS_LABELS[o.status] ?? o.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 300 && <p className="muted" style={{ fontSize: 12 }}>Mostrando 300. A planilha leva todos.</p>}
          </div>
        ) : (
          <p className="muted">Nenhum pedido nesse filtro.</p>
        )}
      </section>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="kpi">
      <div className="big">{value}</div>
      <div className="lbl">{label}</div>
    </div>
  );
}
