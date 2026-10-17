import { adminDb } from '@/lib/context';
import { json, serverError, badRequest } from '@/lib/api';
import { syncIfoodLogistics, captureError, checkRateLimit } from '@leeva/shared/services';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Sincronização de pedidos do iFood — POLLING (o iFood não manda webhook).
 * Chamar a cada ~30s (mesmo padrão do dispatch-tick) quando a integração
 * estiver em produção; por ora, PREPARADO/sandbox, acionado manualmente ou
 * pelo script de teste.
 *
 * Protegido por CRON_SECRET, igual aos outros crons.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return json({ error: 'endpoint desativado: defina CRON_SECRET' }, 503);
  const provided = req.headers.get('x-cron-secret') ?? '';
  if (provided.length !== secret.length || provided !== secret) {
    return json({ error: 'não autorizado' }, 401);
  }

  const db = adminDb();
  const url = new URL(req.url);
  let restaurantId = url.searchParams.get('restaurant');
  if (restaurantId && !UUID.test(restaurantId)) return badRequest('restaurant inválido');
  if (!restaurantId) {
    const { data: all } = await db.from('restaurants').select('id').limit(2);
    if (all?.length === 1) restaurantId = all[0]!.id;
  }
  if (!restaurantId) return badRequest('informe ?restaurant=<uuid> (mais de um restaurante cadastrado)');

  const rl = await checkRateLimit(db, 'default', 'cron:ifood-poll', { limit: 4, windowSeconds: 30 });
  if (!rl.allowed) return json({ ok: true, skipped: true, reason: 'rate_limited' });

  try {
    // módulo Logistics (o cron de 30 s já faz isto pra todos; aqui é o disparo manual)
    const result = await syncIfoodLogistics(db, restaurantId);
    return json(result);
  } catch (e) {
    await captureError(db, 'cron', e, { endpoint: 'ifood-poll' });
    return serverError(e);
  }
}
