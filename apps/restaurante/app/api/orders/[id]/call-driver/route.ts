import { getApiContext, adminDb } from '@/lib/context';
import { unauthorized, forbidden, serverError, json, orderBelongsTo } from '@/lib/api';
import { callDriverForOrder } from '@leeva/shared/services';

/**
 * "Chamar entregador" para um pedido segurado (dispatch_hold) — importado do
 * iFood com a opção "eu decido". Só aqui a taxa é cobrada e o despacho começa.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getApiContext();
    if (!ctx) return unauthorized();
    if (ctx.role !== 'restaurant_owner') return forbidden('só o dono chama entregador');
    const { id } = await params;
    const db = adminDb();
    if (!(await orderBelongsTo(db, id, ctx.restaurantId))) return forbidden();

    const r = await callDriverForOrder(db, id, ctx.restaurantId);
    if (!r.ok) return json({ error: r.error, code: r.code }, 400);
    return json({ ok: true, cost: r.cost });
  } catch (e) {
    return serverError(e);
  }
}
