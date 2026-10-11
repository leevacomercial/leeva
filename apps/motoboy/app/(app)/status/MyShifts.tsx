import type { Shift } from '@leeva/shared/services';

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

/** "Minha escala" — próximos turnos lançados pelo estabelecimento. Some se não houver nenhum. */
export default function MyShifts({ shifts }: { shifts: Shift[] }) {
  if (!shifts.length) return null;
  const now = Date.now();
  return (
    <div className="panel">
      <strong style={{ display: 'block', marginBottom: 8 }}>Minha escala</strong>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
        {shifts.slice(0, 7).map((s) => {
          const live = new Date(s.starts_at).getTime() <= now && now < new Date(s.ends_at).getTime();
          return (
            <li key={s.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontVariantNumeric: 'tabular-nums' }}>
              <span style={{ textTransform: 'capitalize' }}>{day(s.starts_at)}</span>
              <span>
                {time(s.starts_at)} – {time(s.ends_at)}
                {live && (
                  <strong style={{ marginLeft: 8, color: 'var(--ok, #16a34a)' }}>agora</strong>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
