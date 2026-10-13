/**
 * TESTE DE PONTA A PONTA no restaurante DEMO (nunca em loja de cliente):
 * cria 3 motoboys de teste (equipe própria, online, com GPS perto da loja),
 * uma tabela de bairros de exemplo e 5 pedidos reais pelo mesmo caminho do
 * painel (createOrderFromNormalized + despacho pela fila). No fim mostra o
 * que aconteceu com cada pedido.
 *
 * uso (na raiz): npx tsx scripts/teste-demo-fila.ts
 * limpar:        npx tsx scripts/teste-demo-fila.ts --limpar
 */
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../packages/shared/src/types/database';
import { createOrderFromNormalized } from '../packages/shared/src/services/orders';
import { dispatchTick } from '../packages/shared/src/services/autodispatch';
import type { NormalizedOrder } from '../packages/shared/src/integrations/types';

const DEMO = '92a54ae7-6ab1-442d-94c5-42aac96a3d47';
const TAG = '(teste)';

const env = Object.fromEntries(
  fs
    .readFileSync('apps/restaurante/.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]),
);
const db = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

async function limpar() {
  const { data: ms } = await db.from('motoboys').select('id').eq('restaurant_id', DEMO).like('full_name', `%${TAG}%`);
  const ids = (ms ?? []).map((m) => m.id);
  await db.from('orders').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('restaurant_id', DEMO).like('customer_name', `%${TAG}%`).not('status', 'in', '(delivered,cancelled)');
  if (ids.length) await db.from('motoboys').update({ active: false, status: 'offline' }).in('id', ids);
  console.log(`limpo: ${ids.length} motoboys desativados, pedidos de teste cancelados`);
}

async function main() {
  if (process.argv.includes('--limpar')) return limpar();

  const { data: rst } = await db.from('restaurants').select('latitude, longitude, logistics_config').eq('id', DEMO).single();
  const lat0 = Number(rst!.latitude);
  const lng0 = Number(rst!.longitude);
  const { data: terms } = await db.from('terms_versions').select('version').eq('audience', 'motoboy').eq('active', true).order('version', { ascending: false }).limit(1).maybeSingle();

  // tabela de bairros de exemplo (cliente paga / motoboy recebe)
  const cfg = (rst!.logistics_config ?? {}) as Record<string, unknown>;
  if (!Array.isArray(cfg.customer_fee_by_region) || !(cfg.customer_fee_by_region as unknown[]).length) {
    cfg.customer_fee_by_region = [
      { region: 'Valentina', fee: 6, driver_pay: 5 },
      { region: 'Mangabeira', fee: 8, driver_pay: 6 },
      { region: 'Gramame', fee: 7, driver_pay: 5 },
      { region: 'José Américo', fee: 9, driver_pay: 7 },
    ];
    await db.from('restaurants').update({ logistics_config: cfg as never }).eq('id', DEMO);
  }

  // 3 motoboys online perto da loja; entram na fila em ordem (João primeiro)
  const nomes = ['João', 'Pedro', 'Lucas'];
  const motoboys: string[] = [];
  for (const [i, nome] of nomes.entries()) {
    const full = `${nome} ${TAG}`;
    const { data: ex } = await db.from('motoboys').select('id').eq('restaurant_id', DEMO).eq('full_name', full).maybeSingle();
    const row = {
      restaurant_id: DEMO,
      fleet: 'own' as const,
      full_name: full,
      phone: `8399990000${i}`,
      active: true,
      approval_status: 'approved' as const,
      terms_accepted_version: terms?.version ?? 1,
      status: 'available' as const,
      current_latitude: lat0 + (i - 1) * 0.004,
      current_longitude: lng0 + 0.003 * i,
      location_updated_at: new Date().toISOString(),
      queue_since: new Date(Date.now() - (30 - i * 10) * 60000).toISOString(),
    };
    if (ex) {
      await db.from('motoboys').update(row).eq('id', ex.id);
      motoboys.push(ex.id);
    } else {
      const { data: c, error } = await db.from('motoboys').insert(row).select('id').single();
      if (error) throw error;
      motoboys.push(c!.id);
    }
  }
  console.log('motoboys de teste:', nomes.join(', '));

  const pedidos: { nome: string; bairro: string; dLat: number; dLng: number; pag: NormalizedOrder['paymentMethod']; total: number }[] = [
    { nome: 'Maria', bairro: 'Valentina', dLat: 0.012, dLng: 0.022, pag: 'cash', total: 45 },
    { nome: 'Carlos', bairro: 'Valentina', dLat: 0.014, dLng: 0.025, pag: 'online', total: 62 },
    { nome: 'Ana', bairro: 'Mangabeira', dLat: 0.045, dLng: 0.03, pag: 'card_on_delivery', total: 38.5 },
    { nome: 'Rafa', bairro: 'Gramame', dLat: -0.01, dLng: -0.02, pag: 'pix', total: 29.9 },
    { nome: 'Bia', bairro: 'Cristo Redentor', dLat: 0.05, dLng: -0.03, pag: 'cash', total: 51 },
  ];
  for (const [i, p] of pedidos.entries()) {
    const order: NormalizedOrder = {
      externalId: `teste-${Date.now()}-${i}`,
      source: 'manual',
      eventId: null,
      customer: { name: `${p.nome} ${TAG}`, phone: `83988880${String(i).padStart(3, '0')}` },
      items: [],
      address: {
        formatted: `Rua de Teste, ${100 + i}, ${p.bairro}, João Pessoa - PB`,
        latitude: lat0 + p.dLat,
        longitude: lng0 + p.dLng,
        region: p.bairro,
      },
      total: p.pag === 'online' ? 0 : p.total,
      deliveryFee: 0,
      paymentMethod: p.pag,
      paymentStatus: p.pag === 'online' ? 'paid' : 'pending',
      notes: 'pedido de teste — pode cancelar',
    };
    const r = await createOrderFromNormalized(db, DEMO, order);
    console.log(`#${r.ok ? r.orderNumber : '—'} ${p.nome} (${p.bairro}) ->`, r.ok ? 'criado' : r.error);
  }

  const tick = await dispatchTick(db, { source: 'event', restaurantId: DEMO });
  console.log('fila:', tick.details.join(' | ') || 'nada a despachar');

  const { data: open } = await db
    .from('orders')
    .select('order_number, customer_name, region, status, motoboy_id, delivery_fee, driver_payout, payment_method')
    .eq('restaurant_id', DEMO)
    .like('customer_name', `%${TAG}%`)
    .not('status', 'in', '(delivered,cancelled)')
    .order('order_number');
  const nameOf = new Map<string, string>();
  for (const [i, id] of motoboys.entries()) nameOf.set(id, nomes[i]!);
  for (const o of open ?? []) {
    console.log(
      `#${o.order_number} ${o.customer_name} · ${o.region} · ${o.payment_method} · cliente R$ ${o.delivery_fee} · motoboy R$ ${o.driver_payout ?? '—'} · ${o.motoboy_id ? `com ${nameOf.get(o.motoboy_id)}` : 'SEM motoboy'} · ${o.status}`,
    );
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
