/**
 * TESTE DE PONTA A PONTA do iFood (módulo Logistics) no restaurante DEMO,
 * com o app de teste "Teste (C)" vinculado em Integrações.
 *
 * 1. pega o pedido de teste mais recente gerado no Developer Portal
 * 2. confirma o pedido como a LOJA faria (Order API — no real é o Gestor de
 *    Pedidos do iFood; sem isso o iFood cancela em 8 min)
 * 3. roda o ciclo do Leeva (importa o pedido)
 * 4. manda pro motoboy de teste e avisa as etapas ao iFood, uma por uma
 * 5. tenta fechar a entrega (arrivedAtDestination + código)
 *
 * uso: npx tsx scripts/teste-ifood-logistics.ts [codigo-de-entrega]
 */
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../packages/shared/src/types/database';

const env = Object.fromEntries(
  fs
    .readFileSync('apps/restaurante/.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]),
);
process.env.INTEGRATIONS_ENCRYPTION_KEY = env.INTEGRATIONS_ENCRYPTION_KEY;

const DEMO = '92a54ae7-6ab1-442d-94c5-42aac96a3d47';
const BASE = 'https://merchant-api.ifood.com.br';

async function main() {
  const { syncIfoodLogistics, pushIfoodLogisticsSteps, confirmIfoodLogisticsDelivery } = await import('../packages/shared/src/services/ifood-logistics');
  const { getValidIfoodAccessToken } = await import('../packages/shared/src/services/ifood-link');
  const { assignDriver, advanceOrderStatus } = await import('../packages/shared/src/services/orders');
  const db = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

  // 1+2+3. espera o pedido novo entrar no Leeva (pelo agendador no ar ou por
  // este ciclo) e confirma no iFood como a loja faria
  const { token } = await getValidIfoodAccessToken(db, DEMO);
  const since = new Date(Date.now() - 3 * 60_000).toISOString();
  let o: { id: string; order_number: number | null; status: string; dispatch_hold: boolean; external_id: string | null } | null = null;
  for (let i = 0; i < 12 && !o; i++) {
    const s = await syncIfoodLogistics(db, DEMO);
    if (s.polled || s.imported) log('sync:', JSON.stringify(s));
    const { data } = await db
      .from('orders')
      .select('id, order_number, status, dispatch_hold, external_id')
      .eq('restaurant_id', DEMO)
      .eq('source', 'ifood')
      .gte('created_at', since)
      .not('status', 'in', '(delivered,cancelled)')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    o = data;
    if (!o) await new Promise((res) => setTimeout(res, 10_000));
  }
  if (!o) throw new Error('pedido não entrou no Leeva (gere um no Developer Portal)');
  const ifoodId = o.external_id!;
  log('pedido iFood', ifoodId);
  const cf = await fetch(`${BASE}/order/v1.0/orders/${ifoodId}/confirm`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  log('confirmado como loja (Order API):', cf.status);
  log(`Leeva #${o.order_number} status=${o.status} hold=${o.dispatch_hold}`);
  if (o.dispatch_hold) await db.from('orders').update({ dispatch_hold: false }).eq('id', o.id);

  // 4. motoboy de teste + etapas
  const { data: m } = await db.from('motoboys').select('id, full_name').eq('restaurant_id', DEMO).like('full_name', '%(teste)%').eq('active', true).limit(1).maybeSingle();
  if (!m) throw new Error('sem motoboy de teste (rode scripts/teste-demo-fila.ts)');
  const a = await assignDriver(db, o.id, m.id, { reassign: true });
  log('motoboy', m.full_name, a.ok ? 'definido' : a.error);
  log('etapas (assignDriver+goingToOrigin):', await pushIfoodLogisticsSteps(db, DEMO, o.id));
  await advanceOrderStatus(db, o.id, 'picked_up', { actorType: 'motoboy', actorId: m.id });
  log('retirou → etapas:', await pushIfoodLogisticsSteps(db, DEMO, o.id));
  await advanceOrderStatus(db, o.id, 'in_route', { actorType: 'motoboy', actorId: m.id });
  log('saiu pra entrega → etapas:', await pushIfoodLogisticsSteps(db, DEMO, o.id));

  // 5. chegada + código
  const code = process.argv[2] ?? null;
  await new Promise((res) => setTimeout(res, 3000));
  await syncIfoodLogistics(db, DEMO); // pega o DDCR se o iFood pedir código
  const v = await confirmIfoodLogisticsDelivery(db, DEMO, o.id, code);
  log('fechar entrega:', JSON.stringify(v));

  const { data: out } = await db
    .from('integration_events')
    .select('payload, created_at')
    .eq('provider', 'ifood')
    .eq('direction', 'outbound')
    .eq('order_id', o.id)
    .order('created_at');
  for (const e of out ?? []) {
    const p = e.payload as { action: string; httpStatus: number; response: unknown };
    log(`→ iFood ${p.action}: HTTP ${p.httpStatus} ${p.response ? JSON.stringify(p.response).slice(0, 120) : ''}`);
  }
  const { data: fin } = await db.from('orders').select('status, ifood_logistics_step, ifood_code_required').eq('id', o.id).maybeSingle();
  log('final:', JSON.stringify(fin));
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error('ERRO', e.message);
    process.exit(1);
  },
);
