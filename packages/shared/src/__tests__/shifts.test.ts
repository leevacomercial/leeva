import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isShiftActive, shiftsOverlap, validateShiftTimes, shiftByWeeks } from '../services/shifts';

// sexta 10/10/2026 18:00 → 23:30 em João Pessoa (UTC-3)
const shift = { starts_at: '2026-10-10T21:00:00.000Z', ends_at: '2026-10-11T02:30:00.000Z' };
const now = new Date('2026-10-10T12:00:00.000Z');

test('turno ativo: início incluso, fim excluso', () => {
  assert.equal(isShiftActive(shift, new Date('2026-10-10T20:59:59Z')), false);
  assert.equal(isShiftActive(shift, new Date('2026-10-10T21:00:00Z')), true);
  assert.equal(isShiftActive(shift, new Date('2026-10-11T01:00:00Z')), true); // virou a noite
  assert.equal(isShiftActive(shift, new Date('2026-10-11T02:30:00Z')), false);
});

test('sobreposição: encostar ponta com ponta não conta', () => {
  const after = { starts_at: shift.ends_at, ends_at: '2026-10-11T05:00:00.000Z' };
  const inside = { starts_at: '2026-10-10T22:00:00.000Z', ends_at: '2026-10-10T23:00:00.000Z' };
  assert.equal(shiftsOverlap(shift, after), false);
  assert.equal(shiftsOverlap(shift, inside), true);
  assert.equal(shiftsOverlap(inside, shift), true);
});

test('validação de horário', () => {
  assert.equal(validateShiftTimes(shift.starts_at, shift.ends_at, now), null);
  assert.match(validateShiftTimes(shift.ends_at, shift.starts_at, now)!, /depois do início/);
  assert.match(validateShiftTimes('x', shift.ends_at, now)!, /inválido/);
  assert.match(
    validateShiftTimes('2026-10-10T00:00:00Z', '2026-10-10T17:00:00Z', now)!,
    /16 horas/,
  );
  assert.match(validateShiftTimes('2026-09-01T21:00:00Z', '2026-09-01T23:00:00Z', now)!, /semana atrás/);
  assert.match(validateShiftTimes('2027-03-01T21:00:00Z', '2027-03-01T23:00:00Z', now)!, /90 dias/);
});

test('copiar pra próxima semana mantém dia da semana e horário', () => {
  const next = shiftByWeeks({ ...shift, motoboy_id: 'm1' }, 1);
  assert.equal(next.starts_at, '2026-10-17T21:00:00.000Z');
  assert.equal(next.ends_at, '2026-10-18T02:30:00.000Z');
  assert.equal(next.motoboy_id, 'm1');
});
