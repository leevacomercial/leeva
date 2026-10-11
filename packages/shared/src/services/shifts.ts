// Escalas e turnos da frota própria (migration 0052).
//
// Um turno = um motoboy da equipe do restaurante trabalhando de starts_at até
// ends_at. Com logistics_config.shifts_enforced ligado, o despacho automático
// só chama quem tem turno cobrindo o horário atual (ver autodispatch.ts).

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

type DB = SupabaseClient<Database>;

export type Shift = {
  id: string;
  motoboy_id: string;
  starts_at: string;
  ends_at: string;
  note: string | null;
};

export const SHIFT_MAX_HOURS = 16;
const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

// ---------------------------------------------------------------------------
// Regras puras (testadas em __tests__/shifts.test.ts)
// ---------------------------------------------------------------------------

/** O turno cobre o instante `now`? (início incluso, fim excluso) */
export function isShiftActive(s: Pick<Shift, 'starts_at' | 'ends_at'>, now: Date = new Date()): boolean {
  const t = now.getTime();
  return new Date(s.starts_at).getTime() <= t && t < new Date(s.ends_at).getTime();
}

/** Dois intervalos se sobrepõem? (encostar ponta com ponta não conta) */
export function shiftsOverlap(
  a: Pick<Shift, 'starts_at' | 'ends_at'>,
  b: Pick<Shift, 'starts_at' | 'ends_at'>,
): boolean {
  return (
    new Date(a.starts_at).getTime() < new Date(b.ends_at).getTime() &&
    new Date(b.starts_at).getTime() < new Date(a.ends_at).getTime()
  );
}

/** Valida horário de um turno. Devolve a mensagem de erro (PT-BR) ou null. */
export function validateShiftTimes(startsAt: string, endsAt: string, now: Date = new Date()): string | null {
  const s = new Date(startsAt).getTime();
  const e = new Date(endsAt).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e)) return 'horário inválido';
  if (e <= s) return 'o fim do turno precisa ser depois do início';
  if (e - s > SHIFT_MAX_HOURS * 3_600_000) return `turno não pode passar de ${SHIFT_MAX_HOURS} horas`;
  if (e < now.getTime() - WEEK_MS) return 'não dá pra lançar turno de mais de uma semana atrás';
  if (s > now.getTime() + 90 * DAY_MS) return 'só dá pra montar escala até 90 dias pra frente';
  return null;
}

/** Desloca um turno N semanas (mesmo dia da semana e mesmo horário). */
export function shiftByWeeks<T extends Pick<Shift, 'starts_at' | 'ends_at'>>(s: T, weeks: number): T {
  return {
    ...s,
    starts_at: new Date(new Date(s.starts_at).getTime() + weeks * WEEK_MS).toISOString(),
    ends_at: new Date(new Date(s.ends_at).getTime() + weeks * WEEK_MS).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Banco
// ---------------------------------------------------------------------------

async function ownMotoboy(db: DB, restaurantId: string, motoboyId: string): Promise<boolean> {
  const { data } = await db
    .from('motoboys')
    .select('id')
    .eq('id', motoboyId)
    .eq('restaurant_id', restaurantId)
    .eq('fleet', 'own')
    .maybeSingle();
  return !!data;
}

/** Turnos do restaurante que tocam o intervalo [fromIso, toIso). */
export async function listShifts(db: DB, restaurantId: string, fromIso: string, toIso: string): Promise<Shift[]> {
  const { data, error } = await db
    .from('driver_shifts')
    .select('id, motoboy_id, starts_at, ends_at, note')
    .eq('restaurant_id', restaurantId)
    .lt('starts_at', toIso)
    .gt('ends_at', fromIso)
    .order('starts_at');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createShift(
  db: DB,
  restaurantId: string,
  input: { motoboyId: string; startsAt: string; endsAt: string; note?: string | null },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const invalid = validateShiftTimes(input.startsAt, input.endsAt);
  if (invalid) return { ok: false, error: invalid };
  if (!(await ownMotoboy(db, restaurantId, input.motoboyId)))
    return { ok: false, error: 'motoboy não é da sua equipe' };

  const startsAt = new Date(input.startsAt).toISOString();
  const endsAt = new Date(input.endsAt).toISOString();

  const { data: clash } = await db
    .from('driver_shifts')
    .select('id')
    .eq('motoboy_id', input.motoboyId)
    .lt('starts_at', endsAt)
    .gt('ends_at', startsAt)
    .limit(1);
  if (clash?.length) return { ok: false, error: 'esse motoboy já tem um turno nesse horário' };

  const { data, error } = await db
    .from('driver_shifts')
    .insert({
      restaurant_id: restaurantId,
      motoboy_id: input.motoboyId,
      starts_at: startsAt,
      ends_at: endsAt,
      note: input.note?.trim().slice(0, 120) || null,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return { ok: true, id: data.id };
}

export async function deleteShift(db: DB, restaurantId: string, shiftId: string): Promise<boolean> {
  const { data, error } = await db
    .from('driver_shifts')
    .delete()
    .eq('id', shiftId)
    .eq('restaurant_id', restaurantId)
    .select('id');
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

/**
 * Repete a semana que começa em `weekStartIso` na semana seguinte. Turnos que
 * bateriam com algum já lançado na semana de destino são pulados (nada é
 * sobrescrito), e motoboys que saíram da equipe ficam de fora.
 */
export async function copyWeekToNext(
  db: DB,
  restaurantId: string,
  weekStartIso: string,
): Promise<{ copied: number; skipped: number }> {
  const from = new Date(weekStartIso);
  if (!Number.isFinite(from.getTime())) throw new Error('semana inválida');
  const to = new Date(from.getTime() + WEEK_MS);
  const nextTo = new Date(to.getTime() + WEEK_MS);

  // só turnos que COMEÇAM na semana de origem (turno que vira a noite entra uma vez)
  const source = (await listShifts(db, restaurantId, from.toISOString(), to.toISOString())).filter(
    (s) => new Date(s.starts_at) >= from && new Date(s.starts_at) < to,
  );
  if (!source.length) return { copied: 0, skipped: 0 };

  const target = await listShifts(db, restaurantId, to.toISOString(), nextTo.toISOString());

  const { data: team } = await db
    .from('motoboys')
    .select('id')
    .eq('restaurant_id', restaurantId)
    .eq('fleet', 'own')
    .eq('active', true);
  const activeTeam = new Set((team ?? []).map((m) => m.id));

  const rows: Database['public']['Tables']['driver_shifts']['Insert'][] = [];
  let skipped = 0;
  for (const s of source) {
    const moved = shiftByWeeks(s, 1);
    const busy = [...target, ...rows].some(
      (t) => t.motoboy_id === s.motoboy_id && shiftsOverlap(t as Shift, moved),
    );
    if (busy || !activeTeam.has(s.motoboy_id)) {
      skipped += 1;
      continue;
    }
    rows.push({
      restaurant_id: restaurantId,
      motoboy_id: s.motoboy_id,
      starts_at: moved.starts_at,
      ends_at: moved.ends_at,
      note: s.note,
    });
  }
  if (rows.length) {
    const { error } = await db.from('driver_shifts').insert(rows);
    if (error) throw new Error(error.message);
  }
  return { copied: rows.length, skipped };
}

/** IDs dos motoboys do restaurante com turno cobrindo `now`. */
export async function onShiftMotoboyIds(db: DB, restaurantId: string, now: Date = new Date()): Promise<Set<string>> {
  const iso = now.toISOString();
  const { data, error } = await db
    .from('driver_shifts')
    .select('motoboy_id')
    .eq('restaurant_id', restaurantId)
    .lte('starts_at', iso)
    .gt('ends_at', iso);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r) => r.motoboy_id));
}

/** Próximos turnos de um motoboy (o atual, se houver, vem primeiro). */
export async function listMotoboyShifts(db: DB, motoboyId: string, days = 14): Promise<Shift[]> {
  const now = new Date();
  const { data, error } = await db
    .from('driver_shifts')
    .select('id, motoboy_id, starts_at, ends_at, note')
    .eq('motoboy_id', motoboyId)
    .gt('ends_at', now.toISOString())
    .lt('starts_at', new Date(now.getTime() + days * DAY_MS).toISOString())
    .order('starts_at')
    .limit(50);
  if (error) throw new Error(error.message);
  return data ?? [];
}
