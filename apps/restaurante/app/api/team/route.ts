import { getApiContext, adminDb } from '@/lib/context';
import { json, unauthorized, forbidden, badRequest, serverError, UUID } from '@/lib/api';
import { onlyDigits } from '@leeva/shared';

/**
 * Gestão da equipe de motoboys do restaurante (frota própria).
 * body: { full_name, phone } para criar | { id, active } para ativar/desativar
 */
export async function POST(req: Request) {
  const ctx = await getApiContext();
  if (!ctx) return unauthorized();
  try {
    const db = adminDb();
    const b = (await req.json().catch(() => ({}))) as {
      id?: string;
      active?: boolean;
      full_name?: string;
      phone?: string;
    };

    if (b.id) {
      if (!UUID.test(b.id)) return badRequest('id inválido');
      const { data: m } = await db
        .from('motoboys')
        .select('id')
        .eq('id', b.id)
        .eq('restaurant_id', ctx.restaurantId)
        .eq('fleet', 'own')
        .maybeSingle();
      if (!m) return forbidden();
      await db.from('motoboys').update({ active: b.active !== false }).eq('id', b.id);
      return json({ ok: true });
    }

    const name = (b.full_name ?? '').trim();
    const phone = onlyDigits(b.phone ?? '');
    if (!name || phone.length < 10) return badRequest('nome e telefone válidos são obrigatórios');

    const { data: dup } = await db
      .from('motoboys')
      .select('id')
      .eq('restaurant_id', ctx.restaurantId)
      .eq('phone', phone)
      .maybeSingle();
    if (dup) return badRequest('já existe um entregador com esse telefone');

    await db.from('motoboys').insert({
      restaurant_id: ctx.restaurantId,
      fleet: 'own',
      full_name: name.slice(0, 120),
      phone,
      status: 'offline',
      active: true,
    });
    return json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
