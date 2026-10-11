import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addMonths, nextPaidPeriod } from '../services/billing';

test('addMonths mantém o dia e respeita fim de mês', () => {
  assert.equal(addMonths(new Date('2026-10-15T12:00:00Z'), 1).toISOString(), '2026-11-15T12:00:00.000Z');
  assert.equal(addMonths(new Date('2027-01-31T12:00:00Z'), 1).toISOString(), '2027-02-28T12:00:00.000Z');
  assert.equal(addMonths(new Date('2026-12-10T12:00:00Z'), 1).toISOString(), '2027-01-10T12:00:00.000Z');
});

test('pagou em dia: o mês novo emenda no fim do atual', () => {
  const now = new Date('2026-10-11T12:00:00Z');
  const r = nextPaidPeriod({ status: 'active', current_period_end: '2026-10-20T12:00:00Z' }, now);
  assert.equal(r.start.toISOString(), '2026-10-20T12:00:00.000Z');
  assert.equal(r.end.toISOString(), '2026-11-20T12:00:00.000Z');
});

test('vencido, inadimplente ou em teste: começa hoje', () => {
  const now = new Date('2026-10-11T12:00:00Z');
  for (const status of ['active', 'past_due', 'trialing']) {
    const end = status === 'active' ? '2026-10-01T00:00:00Z' : '2026-10-30T00:00:00Z';
    const r = nextPaidPeriod({ status, current_period_end: end }, now);
    assert.equal(r.start.toISOString(), now.toISOString(), status);
    assert.equal(r.end.toISOString(), '2026-11-11T12:00:00.000Z', status);
  }
});
