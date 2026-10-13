import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findBairroEntry, computeCustomerDeliveryFee } from '../services/payout';

const tabela = [
  { region: 'Manaíra', fee: 8, driver_pay: 6 },
  { region: 'Jardim Oceania', fee: 9, driver_pay: null },
  { region: 'Bessa', fee: 10 },
];

test('bairro: acha pelo campo bairro, sem acento/caixa', () => {
  const e = findBairroEntry(tabela, 'MANAIRA', null);
  assert.equal(e?.region, 'Manaíra');
  assert.equal(e?.driver_pay, 6);
});

test('bairro: acha dentro do endereço quando o bairro não vem separado', () => {
  const e = findBairroEntry(tabela, null, 'Rua Sapé, 120, Jd. Oceânia, João Pessoa');
  assert.equal(e?.region, 'Jardim Oceania');
  assert.equal(e?.driver_pay, null); // motoboy pela regra por km
});

test('bairro fora da lista: cliente paga pela regra por km', () => {
  assert.equal(findBairroEntry(tabela, 'Mangabeira', 'Rua X, Mangabeira'), null);
  const fee = computeCustomerDeliveryFee(
    { customer_fee: 5, free_delivery_min_order: null, customer_fee_included_km: 3, customer_fee_per_extra_km: 1, customer_fee_by_region: tabela },
    6,
    null,
    { region: 'Mangabeira' },
  );
  assert.equal(fee, 8); // 5 + 3 km a mais × 1
});

test('bairro da lista: cliente paga a taxa do bairro', () => {
  const fee = computeCustomerDeliveryFee(
    { customer_fee: 5, free_delivery_min_order: null, customer_fee_included_km: 3, customer_fee_per_extra_km: 1, customer_fee_by_region: tabela },
    6,
    null,
    { region: 'Bessa' },
  );
  assert.equal(fee, 10);
});
