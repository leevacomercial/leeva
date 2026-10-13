'use client';

import { useCallback, useEffect, useState } from 'react';

type Merchant = { id: string; name?: string; corporateName?: string };
type Status = {
  operation?: string;
  salesChannel?: string;
  available?: boolean;
  state?: string;
  message?: { title?: string; subtitle?: string; description?: string } | null;
  validations?: { id?: string; code?: string; state?: string; message?: { title?: string; subtitle?: string } }[];
};
type Interruption = { id: string; description?: string; start: string; end: string };
type Day = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';
type Shift = { id?: string; dayOfWeek: Day; start: string; duration: number };
type Detail = { details: Record<string, unknown>; status: Status[]; interruptions: Interruption[]; openingHours: Shift[] };

const DAYS: { k: Day; l: string }[] = [
  { k: 'MONDAY', l: 'Segunda' },
  { k: 'TUESDAY', l: 'Terça' },
  { k: 'WEDNESDAY', l: 'Quarta' },
  { k: 'THURSDAY', l: 'Quinta' },
  { k: 'FRIDAY', l: 'Sexta' },
  { k: 'SATURDAY', l: 'Sábado' },
  { k: 'SUNDAY', l: 'Domingo' },
];

/** Turno na tela: começa HH:MM, termina HH:MM (o iFood guarda início + duração). */
type Row = { start: string; end: string };
const toRows = (shifts: Shift[], day: Day): Row[] =>
  shifts
    .filter((s) => s.dayOfWeek === day)
    .map((s) => {
      const [h, m] = s.start.split(':').map(Number);
      const endMin = (h! * 60 + m! + s.duration) % (24 * 60);
      return { start: s.start.slice(0, 5), end: `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}` };
    })
    .sort((a, b) => a.start.localeCompare(b.start));
const minutesBetween = (a: string, b: string) => {
  const [ah, am] = a.split(':').map(Number);
  const [bh, bm] = b.split(':').map(Number);
  let d = bh! * 60 + bm! - (ah! * 60 + am!);
  if (d <= 0) d += 24 * 60; // passa da meia-noite
  return d;
};
const fmt = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

/**
 * SUA LOJA NO iFOOD (módulo Merchant): lojas vinculadas, detalhes,
 * disponibilidade, pausas e horário de funcionamento — o que o dono fizer
 * aqui reflete no Portal do Parceiro do iFood.
 */
export function IfoodLoja() {
  const [merchants, setMerchants] = useState<Merchant[] | null>(null);
  const [notLinked, setNotLinked] = useState<string | null>(null);
  const [sel, setSel] = useState<string>('');
  const [d, setD] = useState<Detail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pause, setPause] = useState(() => ({ description: '', start: localInput(new Date()), end: localInput(new Date(Date.now() + 3600_000)) }));
  const [hours, setHours] = useState<Record<Day, Row[]>>(() => Object.fromEntries(DAYS.map((x) => [x.k, []])) as unknown as Record<Day, Row[]>);
  const [showRaw, setShowRaw] = useState(false);

  const call = useCallback(async (init?: RequestInit, qs = '') => {
    const res = await fetch(`/api/ifood/merchant${qs}`, { cache: 'no-store', ...init, headers: { 'content-type': 'application/json' } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = new Error(data.error ?? 'erro') as Error & { status?: number };
      e.status = res.status;
      throw e;
    }
    return data;
  }, []);

  const loadList = useCallback(async () => {
    setBusy('list');
    setErr(null);
    try {
      const r = await call();
      setMerchants(r.merchants ?? []);
      setNotLinked(null);
      if (!sel && r.merchants?.[0]) setSel(r.merchants[0].id);
    } catch (e) {
      if ((e as { status?: number }).status === 409) setNotLinked((e as Error).message);
      else setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }, [call, sel]);

  const loadDetail = useCallback(
    async (id: string) => {
      setBusy('detail');
      setErr(null);
      try {
        const r = (await call(undefined, `?id=${encodeURIComponent(id)}`)) as Detail;
        setD(r);
        setHours(Object.fromEntries(DAYS.map((x) => [x.k, toRows(r.openingHours ?? [], x.k)])) as unknown as Record<Day, Row[]>);
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setBusy(null);
      }
    },
    [call],
  );

  useEffect(() => {
    void loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (sel) void loadDetail(sel);
  }, [sel, loadDetail]);

  async function act(body: Record<string, unknown>, label: string, done: string) {
    setBusy(label);
    setErr(null);
    setOk(null);
    try {
      await call({ method: 'POST', body: JSON.stringify({ id: sel, ...body }) });
      setOk(done);
      await loadDetail(sel);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function saveHours() {
    const shifts: Shift[] = [];
    for (const { k } of DAYS)
      for (const r of hours[k]) if (r.start && r.end) shifts.push({ dayOfWeek: k, start: `${r.start}:00`, duration: minutesBetween(r.start, r.end) });
    void act({ action: 'hours', shifts }, 'hours', 'Horário salvo no iFood. Confira no Portal do Parceiro.');
  }

  /** Exemplo pedido no roteiro de homologação (cenário 3). */
  function fillHomologExample() {
    setHours((h) => ({
      ...h,
      SATURDAY: [{ start: '10:00', end: '19:00' }],
      SUNDAY: [
        { start: '09:00', end: '12:00' },
        { start: '13:00', end: '16:00' },
        { start: '17:00', end: '23:00' },
      ],
    }));
  }

  if (notLinked) {
    return (
      <section className="panel">
        <h2 style={{ fontSize: 16, margin: 0 }}>Sua loja no iFood</h2>
        <p className="muted" style={{ fontSize: 13 }}>
          Conecte o iFood no bloco abaixo pra ver e mexer na sua loja (pausas e horário) direto daqui.
        </p>
      </section>
    );
  }

  const det = d?.details ?? {};
  const addr = (det.address ?? {}) as Record<string, unknown>;

  return (
    <section className="panel" style={{ display: 'grid', gap: 14 }}>
      <div className="spread">
        <div>
          <h2 style={{ fontSize: 16, margin: 0 }}>Sua loja no iFood</h2>
          <p className="muted" style={{ fontSize: 13, margin: '4px 0 0' }}>
            Tudo que você mudar aqui aparece no Portal do Parceiro do iFood.
          </p>
        </div>
        <button className="btn sm" onClick={() => void loadList()} disabled={!!busy}>
          Atualizar
        </button>
      </div>

      {/* Cenário 1 — lojas vinculadas, detalhes e disponibilidade */}
      <div className="section" style={{ display: 'grid', gap: 8 }}>
        <strong style={{ fontSize: 14 }}>Lojas vinculadas ({merchants?.length ?? 0})</strong>
        {merchants?.length ? (
          <table className="data" style={{ fontSize: 13 }}>
            <thead>
              <tr><th>Loja</th><th>Razão social</th><th>ID</th><th /></tr>
            </thead>
            <tbody>
              {merchants.map((m) => (
                <tr key={m.id} style={{ background: m.id === sel ? 'var(--surface-2)' : undefined }}>
                  <td>{m.name ?? '—'}</td>
                  <td>{m.corporateName ?? '—'}</td>
                  <td className="muted" style={{ fontSize: 11 }}>{m.id}</td>
                  <td>
                    <button className="btn sm" onClick={() => setSel(m.id)} disabled={m.id === sel}>
                      {m.id === sel ? 'Aberta' : 'Ver'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>{busy === 'list' ? 'Carregando…' : 'Nenhuma loja vinculada.'}</p>
        )}
      </div>

      {sel && d && (
        <>
          <div className="section" style={{ display: 'grid', gap: 6, fontSize: 13 }}>
            <strong style={{ fontSize: 14 }}>Detalhes da loja</strong>
            <div><span className="muted">Nome:</span> {String(det.name ?? '—')}</div>
            <div><span className="muted">Razão social:</span> {String(det.corporateName ?? '—')}</div>
            {det.description != null && <div><span className="muted">Descrição:</span> {String(det.description)}</div>}
            {addr && Object.keys(addr).length > 0 && (
              <div>
                <span className="muted">Endereço:</span>{' '}
                {[addr.street, addr.number, addr.district, addr.city, addr.state, addr.postalCode].filter(Boolean).map(String).join(', ')}
              </div>
            )}
            {det.averageTicket != null && <div><span className="muted">Ticket médio:</span> {String(det.averageTicket)}</div>}
            <button className="btn sm" style={{ justifySelf: 'start' }} onClick={() => setShowRaw((s) => !s)}>
              {showRaw ? 'Esconder' : 'Ver'} todos os detalhes
            </button>
            {showRaw && <pre style={{ fontSize: 11, maxHeight: 260, overflow: 'auto', background: 'var(--surface-2)', padding: 8, borderRadius: 8 }}>{JSON.stringify(det, null, 2)}</pre>}
          </div>

          <div className="section" style={{ display: 'grid', gap: 6, fontSize: 13 }}>
            <strong style={{ fontSize: 14 }}>Disponibilidade agora</strong>
            {d.status.length ? (
              d.status.map((s, i) => (
                <div key={i} className={`op-alert ${s.available ? 'ok' : 'warning'}`} style={{ margin: 0, display: 'block' }}>
                  <b>{s.available ? 'Aberta' : 'Fechada'}</b>
                  {s.operation ? ` · ${s.operation}` : ''}
                  {s.salesChannel ? ` · ${s.salesChannel}` : ''}
                  {s.state ? ` · ${s.state}` : ''}
                  {s.message?.title && <div>{s.message.title}{s.message.subtitle ? ` — ${s.message.subtitle}` : ''}</div>}
                  {s.validations?.filter((v) => v.state && v.state !== 'OK').map((v, j) => (
                    <div key={j} className="muted" style={{ fontSize: 12 }}>
                      {v.code ?? v.id}: {v.message?.title ?? v.state}
                    </div>
                  ))}
                </div>
              ))
            ) : (
              <span className="muted">Sem informação de status.</span>
            )}
          </div>

          {/* Cenário 2 — pausas */}
          <div className="section" style={{ display: 'grid', gap: 8 }}>
            <strong style={{ fontSize: 14 }}>Pausas (loja fechada temporariamente)</strong>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 }}>
              <label style={{ fontSize: 12 }}>
                Motivo
                <input className="input" placeholder="ex.: falta de motoboy" value={pause.description} onChange={(e) => setPause((p) => ({ ...p, description: e.target.value }))} />
              </label>
              <label style={{ fontSize: 12 }}>
                Começa
                <input className="input" type="datetime-local" value={pause.start} onChange={(e) => setPause((p) => ({ ...p, start: e.target.value }))} />
              </label>
              <label style={{ fontSize: 12 }}>
                Termina
                <input className="input" type="datetime-local" value={pause.end} onChange={(e) => setPause((p) => ({ ...p, end: e.target.value }))} />
              </label>
            </div>
            <div>
              <button
                className="btn primary sm"
                disabled={!!busy}
                onClick={() =>
                  void act(
                    { action: 'pause', description: pause.description, start: new Date(pause.start).toISOString(), end: new Date(pause.end).toISOString() },
                    'pause',
                    'Pausa criada no iFood.',
                  )
                }
              >
                {busy === 'pause' ? 'Criando…' : 'Criar pausa'}
              </button>
            </div>
            <table className="data" style={{ fontSize: 13 }}>
              <thead>
                <tr><th>Motivo</th><th>Começa</th><th>Termina</th><th /></tr>
              </thead>
              <tbody>
                {d.interruptions.map((p) => (
                  <tr key={p.id}>
                    <td>{p.description ?? '—'}</td>
                    <td>{fmt(p.start)}</td>
                    <td>{fmt(p.end)}</td>
                    <td>
                      <button className="btn sm" disabled={!!busy} onClick={() => void act({ action: 'unpause', interruptionId: p.id }, 'unpause', 'Pausa removida no iFood.')}>
                        Remover
                      </button>
                    </td>
                  </tr>
                ))}
                {d.interruptions.length === 0 && (
                  <tr><td colSpan={4} className="muted">Nenhuma pausa ativa.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Cenário 3 — horário de funcionamento */}
          <div className="section" style={{ display: 'grid', gap: 8 }}>
            <div className="spread">
              <strong style={{ fontSize: 14 }}>Horário de funcionamento no iFood</strong>
              <button className="btn sm" type="button" onClick={fillHomologExample}>
                Preencher exemplo (sáb/dom)
              </button>
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              {DAYS.map(({ k, l }) => (
                <div key={k} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ width: 70, fontSize: 13, fontWeight: 600 }}>{l}</span>
                  {hours[k].length === 0 && <span className="muted" style={{ fontSize: 12 }}>fechado</span>}
                  {hours[k].map((r, i) => (
                    <span key={i} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                      <input className="input sm" type="time" value={r.start} onChange={(e) => setHours((h) => ({ ...h, [k]: h[k].map((x, j) => (j === i ? { ...x, start: e.target.value } : x)) }))} />
                      –
                      <input className="input sm" type="time" value={r.end} onChange={(e) => setHours((h) => ({ ...h, [k]: h[k].map((x, j) => (j === i ? { ...x, end: e.target.value } : x)) }))} />
                      <button className="btn sm" type="button" onClick={() => setHours((h) => ({ ...h, [k]: h[k].filter((_, j) => j !== i) }))} title="Tirar turno">✕</button>
                    </span>
                  ))}
                  <button className="btn sm" type="button" onClick={() => setHours((h) => ({ ...h, [k]: [...h[k], { start: '18:00', end: '23:00' }] }))}>
                    + turno
                  </button>
                </div>
              ))}
            </div>
            <div>
              <button className="btn primary sm" onClick={saveHours} disabled={!!busy}>
                {busy === 'hours' ? 'Salvando…' : 'Salvar horário no iFood'}
              </button>
            </div>
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>
              Salvar substitui o horário inteiro da loja no iFood pelo que está aqui.
            </p>
          </div>
        </>
      )}

      {busy === 'detail' && <p className="muted" style={{ fontSize: 13 }}>Carregando a loja…</p>}
      {ok && <div className="op-alert ok" style={{ fontSize: 13 }}>{ok}</div>}
      {err && <div className="op-alert critical" style={{ fontSize: 13 }}>{err}</div>}
    </section>
  );
}
