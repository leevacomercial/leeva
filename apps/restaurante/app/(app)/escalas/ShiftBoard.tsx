'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiGet, apiPost } from '../_lib/client';

type Member = { id: string; full_name: string; status: string };
type Shift = { id: string; motoboy_id: string; starts_at: string; ends_at: string; note: string | null };

const DAY_MS = 86_400_000;
const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

/** Segunda-feira 00:00 (horário local) da semana de `d`. */
function mondayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7; // seg=0 … dom=6
  x.setDate(x.getDate() - dow);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const ddmm = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

function hours(s: Shift): number {
  return (new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()) / 3_600_000;
}

const fmtHours = (h: number) => `${Number.isInteger(h) ? h : h.toFixed(1).replace('.', ',')}h`;

export default function ShiftBoard({ team, initialEnforced }: { team: Member[]; initialEnforced: boolean }) {
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [enforced, setEnforced] = useState(initialEnforced);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // célula aberta para lançar turno
  const [adding, setAdding] = useState<{ motoboyId: string; day: number } | null>(null);
  const [start, setStart] = useState('18:00');
  const [end, setEnd] = useState('23:00');
  const [now, setNow] = useState(() => new Date());

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekEnd = addDays(weekStart, 7);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiGet<{ shifts: Shift[] }>(
        `/api/shifts?from=${encodeURIComponent(weekStart.toISOString())}&to=${encodeURIComponent(addDays(weekStart, 7).toISOString())}`,
      );
      setShifts(r.shifts);
    } catch (e) {
      setMsg({ kind: 'err', text: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => {
    void load();
  }, [load]);

  // atualiza o "de turno agora" a cada minuto (só relógio local, sem chamar o servidor)
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const onShiftNow = useMemo(() => {
    const t = now.getTime();
    return new Set(
      shifts
        .filter((s) => new Date(s.starts_at).getTime() <= t && t < new Date(s.ends_at).getTime())
        .map((s) => s.motoboy_id),
    );
  }, [shifts, now]);

  /** turnos que começam no dia `day` (0..6) para o motoboy */
  function cellShifts(motoboyId: string, day: number): Shift[] {
    const d = days[day]!;
    return shifts.filter((s) => s.motoboy_id === motoboyId && sameDay(new Date(s.starts_at), d));
  }

  function weekHours(motoboyId: string): number {
    return shifts
      .filter((s) => s.motoboy_id === motoboyId && new Date(s.starts_at) >= weekStart && new Date(s.starts_at) < weekEnd)
      .reduce((sum, s) => sum + hours(s), 0);
  }

  async function addShift() {
    if (!adding) return;
    const d = days[adding.day]!;
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    if ([sh, sm, eh, em].some((n) => n == null || !Number.isFinite(n))) {
      setMsg({ kind: 'err', text: 'Preencha início e fim do turno.' });
      return;
    }
    const s = new Date(d.getFullYear(), d.getMonth(), d.getDate(), sh!, sm!);
    let e = new Date(d.getFullYear(), d.getMonth(), d.getDate(), eh!, em!);
    if (e <= s) e = new Date(e.getTime() + DAY_MS); // vira a noite (ex.: 18:00 → 02:00)
    setBusy(true);
    setMsg(null);
    try {
      await apiPost('/api/shifts', {
        action: 'create',
        motoboyId: adding.motoboyId,
        startsAt: s.toISOString(),
        endsAt: e.toISOString(),
      });
      setAdding(null);
      await load();
    } catch (err) {
      setMsg({ kind: 'err', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setMsg(null);
    try {
      await apiPost('/api/shifts', { action: 'delete', id });
      setShifts((cur) => cur.filter((s) => s.id !== id));
    } catch (err) {
      setMsg({ kind: 'err', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function copyWeek() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await apiPost<{ copied: number; skipped: number }>('/api/shifts', {
        action: 'copy_week',
        weekStart: weekStart.toISOString(),
      });
      if (r.copied === 0 && r.skipped === 0) {
        setMsg({ kind: 'err', text: 'Não há turnos nesta semana pra repetir.' });
      } else {
        setMsg({
          kind: 'ok',
          text:
            `${r.copied} turno${r.copied === 1 ? '' : 's'} copiado${r.copied === 1 ? '' : 's'} pra próxima semana` +
            (r.skipped ? ` (${r.skipped} pulado${r.skipped === 1 ? '' : 's'} por já ter turno no horário ou motoboy fora da equipe)` : '') +
            '.',
        });
        setWeekStart(addDays(weekStart, 7));
      }
    } catch (err) {
      setMsg({ kind: 'err', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function toggleEnforce() {
    const next = !enforced;
    setBusy(true);
    setMsg(null);
    try {
      await apiPost('/api/shifts', { action: 'enforce', enabled: next });
      setEnforced(next);
    } catch (err) {
      setMsg({ kind: 'err', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  if (!team.length) {
    return (
      <div className="card">
        <p className="muted" style={{ margin: 0 }}>
          Você ainda não tem motoboys ativos na equipe. <Link href="/equipe">Cadastre sua equipe</Link> e volte aqui
          pra montar a escala.
        </p>
      </div>
    );
  }

  const isCurrentWeek = sameDay(weekStart, mondayOf(new Date()));
  const onShiftNames = team.filter((m) => onShiftNow.has(m.id)).map((m) => m.full_name.split(' ')[0]);

  return (
    <>
      <div className="card esc-top">
        <div>
          <div className="card-title" style={{ marginBottom: 4 }}>
            Despachar só pra quem está de turno
          </div>
          <div className="muted" style={{ fontSize: 'var(--fs-meta)' }}>
            {enforced
              ? 'Ligado: quem estiver fora da escala não recebe entrega, mesmo online.'
              : 'Desligado: a escala é só organização — qualquer motoboy online pode receber entrega.'}
          </div>
        </div>
        <button
          type="button"
          className={`esc-switch ${enforced ? 'on' : ''}`}
          role="switch"
          aria-checked={enforced}
          aria-label="Despachar só pra quem está de turno"
          disabled={busy}
          onClick={toggleEnforce}
        >
          <span />
        </button>
      </div>

      {isCurrentWeek && (
        <div className="esc-now">
          <span className={`tag ${onShiftNames.length ? 'green' : 'gray'}`}>
            {onShiftNames.length ? `De turno agora: ${onShiftNames.join(', ')}` : 'Ninguém de turno agora'}
          </span>
          {enforced && !onShiftNames.length && (
            <span className="tag amber">Com a trava ligada, nenhuma entrega vai sair até alguém entrar no turno</span>
          )}
        </div>
      )}

      <div className="esc-bar">
        <div className="esc-nav">
          <button type="button" className="btn sm" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Semana anterior">
            ‹
          </button>
          <strong>
            {ddmm(weekStart)} – {ddmm(addDays(weekStart, 6))}
          </strong>
          <button type="button" className="btn sm" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Próxima semana">
            ›
          </button>
          {!isCurrentWeek && (
            <button type="button" className="btn ghost sm" onClick={() => setWeekStart(mondayOf(new Date()))}>
              Hoje
            </button>
          )}
        </div>
        <button type="button" className="btn sm" disabled={busy || loading || !shifts.length} onClick={copyWeek}>
          Repetir esta semana na próxima
        </button>
      </div>

      {msg && (
        <div className={`esc-msg ${msg.kind}`} role="status">
          {msg.text}
        </div>
      )}

      <div className="card esc-wrap">
        <table className="esc-grid">
          <thead>
            <tr>
              <th className="esc-name">Motoboy</th>
              {days.map((d, i) => (
                <th key={i} className={sameDay(d, now) ? 'today' : ''}>
                  {WEEKDAYS[i]}
                  <small>{ddmm(d)}</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {team.map((m) => (
              <tr key={m.id}>
                <td className="esc-name">
                  <div>{m.full_name}</div>
                  <small className="muted">
                    {fmtHours(weekHours(m.id))} na semana
                    {onShiftNow.has(m.id) && <span className="esc-dot" title="De turno agora" />}
                  </small>
                </td>
                {days.map((d, i) => {
                  const open = adding?.motoboyId === m.id && adding.day === i;
                  return (
                    <td key={i} className={sameDay(d, now) ? 'today' : ''}>
                      {cellShifts(m.id, i).map((s) => (
                        <span key={s.id} className={`esc-chip ${onShiftNow.has(m.id) && new Date(s.starts_at) <= now && now < new Date(s.ends_at) ? 'live' : ''}`}>
                          {hhmm(s.starts_at)}–{hhmm(s.ends_at)}
                          <button type="button" aria-label="Remover turno" disabled={busy} onClick={() => remove(s.id)}>
                            ×
                          </button>
                        </span>
                      ))}
                      {open ? (
                        <div className="esc-form">
                          <input className="input sm" type="time" value={start} onChange={(e) => setStart(e.target.value)} aria-label="Início" />
                          <input className="input sm" type="time" value={end} onChange={(e) => setEnd(e.target.value)} aria-label="Fim" />
                          <div className="esc-form-actions">
                            <button type="button" className="btn primary sm" disabled={busy} onClick={addShift}>
                              Salvar
                            </button>
                            <button type="button" className="btn ghost sm" onClick={() => setAdding(null)}>
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="esc-add"
                          aria-label={`Adicionar turno de ${m.full_name} em ${WEEKDAYS[i]}`}
                          disabled={loading}
                          onClick={() => {
                            setMsg(null);
                            setAdding({ motoboyId: m.id, day: i });
                          }}
                        >
                          +
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 'var(--fs-meta)', marginTop: 'var(--s3)' }}>
        Turno que vira a noite (ex.: 18:00 às 02:00) fica no dia em que começa. O motoboy vê os próprios turnos no app.
      </p>

      <style>{`
        .esc-top { display: flex; align-items: center; justify-content: space-between; gap: var(--s4); }
        .esc-switch { flex: none; width: 46px; height: 26px; border-radius: 99px; border: 1px solid var(--border-strong);
          background: var(--surface-2); position: relative; cursor: pointer; padding: 0; transition: background .15s; }
        .esc-switch span { position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; border-radius: 50%;
          background: var(--surface); box-shadow: var(--shadow-sm); transition: transform .15s; }
        .esc-switch.on { background: var(--brand); border-color: transparent; }
        .esc-switch.on span { transform: translateX(20px); }
        .esc-switch:disabled { opacity: .6; cursor: wait; }
        .esc-now { display: flex; flex-wrap: wrap; gap: var(--s2); margin: var(--s3) 0; }
        .esc-bar { display: flex; justify-content: space-between; align-items: center; gap: var(--s3); flex-wrap: wrap; margin: var(--s4) 0 var(--s3); }
        .esc-nav { display: flex; align-items: center; gap: var(--s2); }
        .esc-msg { padding: 10px 12px; border-radius: 8px; margin-bottom: var(--s3); font-size: var(--fs-meta); }
        .esc-msg.ok { background: var(--ok-weak); color: var(--ok); }
        .esc-msg.err { background: var(--danger-weak); color: var(--danger); }
        .esc-wrap { padding: 0; overflow-x: auto; }
        .esc-grid { width: 100%; border-collapse: collapse; min-width: 760px; font-size: var(--fs-meta); }
        .esc-grid th, .esc-grid td { border-bottom: 1px solid var(--border); border-left: 1px solid var(--border);
          padding: 8px; vertical-align: top; text-align: left; }
        .esc-grid th { font-weight: 600; background: var(--surface-2); }
        .esc-grid th small { display: block; color: var(--muted); font-weight: 400; }
        .esc-grid tr:last-child td { border-bottom: 0; }
        .esc-grid .esc-name { border-left: 0; min-width: 140px; position: sticky; left: 0; background: var(--surface); z-index: 1; }
        .esc-grid th.esc-name { background: var(--surface-2); }
        .esc-grid .today { background: var(--brand-weak); }
        .esc-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--ok); margin-left: 6px; vertical-align: middle; }
        .esc-chip { display: inline-flex; align-items: center; gap: 4px; background: var(--surface-2); border: 1px solid var(--border);
          border-radius: 6px; padding: 3px 4px 3px 7px; margin: 0 4px 4px 0; white-space: nowrap; font-variant-numeric: tabular-nums; }
        .esc-chip.live { background: var(--ok-weak); border-color: transparent; color: var(--ok); }
        .esc-chip button { border: 0; background: none; color: var(--muted); cursor: pointer; font-size: 15px; line-height: 1; padding: 0 3px; }
        .esc-chip button:hover { color: var(--danger); }
        .esc-add { width: 100%; min-height: 28px; border: 1px dashed var(--border-strong); background: none; border-radius: 6px;
          color: var(--muted); cursor: pointer; font-size: 16px; }
        .esc-add:hover { border-color: var(--brand); color: var(--brand); }
        .esc-form { display: grid; gap: 6px; }
        .esc-form .input { width: 100%; }
        .esc-form-actions { display: flex; gap: 4px; flex-wrap: wrap; }
      `}</style>
    </>
  );
}
