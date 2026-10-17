/**
 * SIMULADOR DA LOJA (só pra teste com o app "Teste (C)"): faz o papel do
 * caixa/Gestor de Pedidos da loja — mantém a loja teste ABERTA no iFood
 * (polling com heartbeat) e CONFIRMA pedido novo. Não confirma recebimento
 * dos eventos (quem faz isso é o Leeva, no agendador).
 *
 * uso: npx tsx scripts/simula-loja-ifood.ts [minutos=6]
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
const BASE = 'https://merchant-api.ifood.com.br';

async function main() {
  const { getValidIfoodAccessToken } = await import('../packages/shared/src/services/ifood-link');
  const db = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const until = Date.now() + Number(process.argv[2] ?? 6) * 60_000;
  const confirmed = new Set<string>();
  while (Date.now() < until) {
    const { token, merchantIds } = await getValidIfoodAccessToken(db, '92a54ae7-6ab1-442d-94c5-42aac96a3d47');
    const r = await fetch(`${BASE}/events/v1.0/events:polling`, {
      headers: { Authorization: `Bearer ${token}`, 'x-polling-merchants': merchantIds.join(',') },
    });
    const evs = r.status === 204 ? [] : ((await r.json().catch(() => [])) as { code: string; orderId?: string }[]);
    for (const e of evs) {
      if (e.code === 'PLC' && e.orderId && !confirmed.has(e.orderId)) {
        const c = await fetch(`${BASE}/order/v1.0/orders/${e.orderId}/confirm`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
        confirmed.add(e.orderId);
        console.log(new Date().toISOString().slice(11, 19), 'loja confirmou', e.orderId.slice(0, 8), c.status);
      }
    }
    const st = await fetch(`${BASE}/merchant/v1.0/merchants/${merchantIds[0]}/status`, { headers: { Authorization: `Bearer ${token}` } });
    const sj = (await st.json().catch(() => [])) as { available?: boolean }[];
    console.log(new Date().toISOString().slice(11, 19), 'polling', r.status, 'eventos', evs.length, 'loja aberta?', sj?.[0]?.available);
    await new Promise((res) => setTimeout(res, 30_000));
  }
}

main().then(() => process.exit(0), (e) => { console.error('ERRO', e.message); process.exit(1); });
