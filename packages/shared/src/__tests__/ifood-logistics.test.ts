import { test } from 'node:test';
import assert from 'node:assert/strict';
import { logisticsOrderToNormalized } from '../integrations/ifood';
import { IFOOD_LOGISTICS_EVENT, IFOOD_LOGISTICS_STEPS } from '../integrations/ifood-client';

// exemplo da própria documentação do iFood (Logistics › Endpoints › GET /orders/{id})
const exemplo = {
  id: '9c964c28-c833-44bb-9457-9b9accca3a6c',
  displayId: '12345',
  orderType: 'DELIVERY',
  createdAt: '2024-01-15T10:30:00.000Z',
  customer: { name: 'João Silva', phone: { number: '0800 123 4567', localizer: '12345678' } },
  items: [{ index: 1, quantity: 2, weight: { unit: 'GRAMS', value: 500 } }],
  payments: { prepaid: 0, pending: 89.99, methods: [{ value: 89.99, currency: 'BRL', method: 'CASH' }] },
  delivery: {
    deliveredBy: 'MERCHANT',
    deliveryAddress: {
      streetName: 'Rua Exemplo',
      streetNumber: '123',
      complement: 'Apto 501',
      neighborhood: 'Centro',
      city: 'São Paulo',
      state: 'SP',
      coordinates: { latitude: -23.5505, longitude: -46.6333 },
    },
  },
};

test('logistics: pedido da doc vira entrega do Leeva (dinheiro a receber)', () => {
  const r = logisticsOrderToNormalized(exemplo);
  assert.ok(r.ok);
  const o = r.order;
  assert.equal(o.externalId, exemplo.id);
  assert.equal(o.source, 'ifood');
  assert.equal(o.ifoodLocator, '12345678');
  assert.equal(o.customer.name, 'João Silva');
  assert.equal(o.address.formatted, 'Rua Exemplo, 123, Centro, São Paulo, SP');
  assert.equal(o.address.region, 'Centro');
  assert.equal(o.address.latitude, -23.5505);
  assert.equal(o.paymentMethod, 'cash');
  assert.equal(o.paymentStatus, 'pending');
  assert.equal(o.total, 89.99);
  assert.ok(o.notes?.includes('iFood #12345'));
  assert.ok(o.notes?.includes('Apto 501'));
  assert.equal(o.items.length, 0); // item sem nome não vira linha
});

test('logistics: pedido já pago no iFood não cobra nada na entrega', () => {
  const r = logisticsOrderToNormalized({ ...exemplo, payments: { prepaid: 50, pending: 0, methods: [{ method: 'CREDIT', value: 50 }] } });
  assert.ok(r.ok);
  assert.equal(r.order.paymentMethod, 'online');
  assert.equal(r.order.paymentStatus, 'paid');
  assert.equal(r.order.total, 0);
});

test('logistics: sem id é rejeitado', () => {
  assert.equal(logisticsOrderToNormalized({}).ok, false);
});

test('logistics: eventos e ordem das etapas', () => {
  assert.ok(IFOOD_LOGISTICS_EVENT.isCodeRequested({ id: '1', code: 'DDCR', fullCode: 'DELIVERY_DROP_CODE_REQUESTED' }));
  assert.ok(IFOOD_LOGISTICS_EVENT.isCancelled({ id: '1', code: 'CAN' }));
  assert.ok(IFOOD_LOGISTICS_EVENT.isNewOrder({ id: '1', code: 'PLC', fullCode: 'PLACED' }));
  assert.deepEqual(IFOOD_LOGISTICS_STEPS, ['assignDriver', 'goingToOrigin', 'arrivedAtOrigin', 'dispatch', 'arrivedAtDestination']);
});
