import { getApiContext, adminDb } from '@/lib/context';
import { json, unauthorized, forbidden, badRequest, serverError, UUID } from '@/lib/api';
import { onlyDigits } from '@leeva/shared';
import { getMapData, isValidCpf, cleanCpf } from '@leeva/shared/services';

/** A equipe agora (livre/em entrega/offline + posição na fila) — usado ao escolher o motoboy de um pedido. */
export async function GET() {
  const ctx = await getApiContext();
  if (!ctx) return unauthorized();
  try {
    const db = adminDb();
    const [{ team }, { data: rst }] = await Promise.all([
      getMapData(db, ctx.restaurantId),
      db.from('restaurants').select('fleet_mode').eq('id', ctx.restaurantId).maybeSingle(),
    ]);
    return json({ team, ownFleet: rst?.fleet_mode === 'own' });
  } catch (e) {
    return serverError(e);
  }
}

/** CPF e chave Pix são OPCIONAIS — só se o dono quiser pedir. */
function optionalExtras(b: { cpf?: string; pix_key?: string }): { ok: true; cpf: string | null; pix: string | null } | { ok: false; error: string } {
  const cpfRaw = (b.cpf ?? '').trim();
  const cpf = cpfRaw ? cleanCpf(cpfRaw) : null;
  if (cpf && !isValidCpf(cpf)) return { ok: false, error: 'CPF inválido (deixe em branco se não quiser informar)' };
  const pix = (b.pix_key ?? '').trim().slice(0, 140) || null;
  return { ok: true, cpf, pix };
}

/**
 * Gestão da equipe de motoboys do restaurante (frota própria).
 * body: { full_name, phone, cpf?, pix_key? } para criar | { id, active } para ativar/desativar
 *       | { id, cpf?, pix_key? } para completar os dados opcionais
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
      cpf?: string;
      pix_key?: string;
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
      if (b.cpf !== undefined || b.pix_key !== undefined) {
        const x = optionalExtras(b);
        if (!x.ok) return badRequest(x.error);
        await db.from('motoboys').update({ cpf: x.cpf, pix_key: x.pix }).eq('id', b.id);
        return json({ ok: true });
      }
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
    const extras = optionalExtras(b);
    if (!extras.ok) return badRequest(extras.error);

    // código do convite (6 números): é o que liga a conta do motoboy a ESTA loja
    const inviteCode = String(Math.floor(100000 + Math.random() * 900000));
    await db.from('motoboys').insert({
      invite_code: inviteCode,
      restaurant_id: ctx.restaurantId,
      fleet: 'own',
      full_name: name.slice(0, 120),
      phone,
      cpf: extras.cpf,
      pix_key: extras.pix,
      status: 'offline',
      active: true,
    });
    return json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
