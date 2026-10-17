import { getMotoboyContextFromReq, adminDb } from '@/lib/context';
import { json, unauthorized, forbidden, badRequest, businessError, serverError, UUID } from '@/lib/api';
import { advanceOrderStatus, acceptDelivery, confirmDeliveryWithProof, pushIfoodLogisticsSteps } from '@leeva/shared/services';
import type { OrderStatus } from '@leeva/shared';

/** Limite defensivo da foto de comprovação (base64) — ~3 MB. */
const MAX_PHOTO_B64 = 3 * 1024 * 1024;

/**
 * Ações do motoboy sobre a entrega dele.
 * body:
 *   { action: 'accept' }
 *   { action: 'status', status: 'picked_up' | 'in_route' }
 *   { action: 'deliver', lat?, lng?, photoBase64, confirmationCode }   ← confirma a entrega (GPS + foto + código)
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getMotoboyContextFromReq(req);
    if (!ctx) return unauthorized();
    const { id } = await params;
    if (!UUID.test(id)) return badRequest('id inválido');
    const db = adminDb();

    const { data: order } = await db
      .from('orders')
      .select('id, motoboy_id, restaurant_id, source')
      .eq('id', id)
      .maybeSingle();
    if (!order || order.motoboy_id !== ctx.motoboyId) {
      return forbidden('essa entrega não é sua');
    }

    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      status?: OrderStatus;
      lat?: number | null;
      lng?: number | null;
      photoBase64?: string;
      confirmationCode?: string;
      ifoodConfirmed?: boolean;
    };

    // pedido do iFood: avisa a etapa no iFood na hora (o cron de 30 s é só a rede de segurança)
    const notifyIfood = async () => {
      if (order.source === 'ifood') await pushIfoodLogisticsSteps(db, order.restaurant_id, id).catch(() => 0);
    };

    if (body.action === 'accept') {
      const r = await acceptDelivery(db, id, ctx.motoboyId);
      if (r.ok) await notifyIfood();
      return r.ok ? json({ ok: true }) : businessError(r.error);
    }

    if (body.action === 'deliver') {
      if (!body.photoBase64) return badRequest('foto obrigatória');
      if (body.photoBase64.length > MAX_PHOTO_B64) return badRequest('foto muito grande');

      const m = /^data:image\/(jpe?g|png|webp);base64,(.+)$/i.exec(body.photoBase64);
      if (!m) return badRequest('formato de foto inválido');
      const ext = m[1]!.toLowerCase() === 'png' ? 'png' : m[1]!.toLowerCase() === 'webp' ? 'webp' : 'jpg';
      const bytes = Buffer.from(m[2]!, 'base64');
      const path = `${id}/${Date.now()}.${ext}`;

      const up = await db.storage
        .from('delivery-proof')
        .upload(path, bytes, { contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`, upsert: false });
      if (up.error) return serverError(up.error);

      const r = await confirmDeliveryWithProof(db, {
        orderId: id,
        motoboyId: ctx.motoboyId,
        lat: body.lat ?? null,
        lng: body.lng ?? null,
        photoPath: path,
        confirmationCode: body.confirmationCode ?? null,
        ifoodConfirmed: body.ifoodConfirmed === true,
      });
      if (!r.ok) {
        // desfaz o upload se a confirmação foi barrada (ex: longe demais, código errado)
        await db.storage.from('delivery-proof').remove([path]).catch(() => {});
        return json({ error: r.error, code: r.code, distanceM: r.distanceM }, r.code === 'too_far' || r.code === 'wrong_code' ? 422 : 400);
      }
      return json({ ok: true, gpsStatus: r.gpsStatus, distanceM: r.distanceM });
    }

    if (body.action === 'status' && body.status) {
      if (body.status === 'delivered') {
        return badRequest('use action "deliver" (com foto e código) para concluir a entrega');
      }
      const allowed: OrderStatus[] = ['picked_up', 'in_route'];
      if (!allowed.includes(body.status)) {
        return badRequest('status não permitido para motoboy');
      }
      const r = await advanceOrderStatus(db, id, body.status, {
        actorType: 'motoboy',
        actorId: ctx.motoboyId,
      });
      if (r.ok) await notifyIfood();
      return r.ok ? json({ ok: true }) : businessError(r.error);
    }

    return badRequest('ação inválida');
  } catch (e) {
    return serverError(e);
  }
}
