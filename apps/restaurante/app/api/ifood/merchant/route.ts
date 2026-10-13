import { getApiContext, adminDb } from '@/lib/context';
import { json, unauthorized, forbidden, badRequest, serverError } from '@/lib/api';
import { getValidIfoodAccessToken, IfoodNotLinkedError } from '@leeva/shared/services';
import {
  IfoodApiError,
  listIfoodMerchants,
  getIfoodMerchant,
  getIfoodMerchantStatus,
  listIfoodInterruptions,
  createIfoodInterruption,
  deleteIfoodInterruption,
  getIfoodOpeningHours,
  putIfoodOpeningHours,
  type IfoodDay,
  type IfoodShift,
} from '@leeva/shared/integrations';

/**
 * MÓDULO MERCHANT do iFood (homologação): a loja vê e mexe na loja dela no
 * iFood pelo Leeva — lista de lojas, detalhes, disponibilidade, pausas e
 * horário de funcionamento. Tudo reflete no Portal do Parceiro.
 *
 * GET  /api/ifood/merchant            → lojas vinculadas
 * GET  /api/ifood/merchant?id=…       → detalhes + disponibilidade + pausas + horário
 * POST /api/ifood/merchant { id, action: 'pause', description, start, end }
 *                          { id, action: 'unpause', interruptionId }
 *                          { id, action: 'hours', shifts: [{ dayOfWeek, start, duration }] }
 */
const DAYS: IfoodDay[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

function ifoodError(e: unknown) {
  if (e instanceof IfoodNotLinkedError) return json({ error: 'Conecte o iFood primeiro (logo abaixo).' }, 409);
  if (e instanceof IfoodApiError) return json({ error: e.message, details: e.body ?? null }, 502);
  return serverError(e);
}

/** Só aceita loja que este vínculo realmente enxerga no iFood. */
async function ownMerchant(token: string, id: string) {
  const list = await listIfoodMerchants(token);
  return list.some((m) => m.id === id);
}

export async function GET(req: Request) {
  const ctx = await getApiContext();
  if (!ctx) return unauthorized();
  try {
    const { token } = await getValidIfoodAccessToken(adminDb(), ctx.restaurantId);
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return json({ merchants: await listIfoodMerchants(token) });
    if (!(await ownMerchant(token, id))) return forbidden('loja não vinculada a esta conta');
    const [details, status, interruptions, openingHours] = await Promise.all([
      getIfoodMerchant(token, id),
      getIfoodMerchantStatus(token, id),
      listIfoodInterruptions(token, id),
      getIfoodOpeningHours(token, id),
    ]);
    return json({ details, status, interruptions, openingHours });
  } catch (e) {
    return ifoodError(e);
  }
}

export async function POST(req: Request) {
  const ctx = await getApiContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== 'restaurant_owner') return forbidden('só o dono mexe na loja do iFood');
  try {
    const b = (await req.json().catch(() => ({}))) as {
      id?: string;
      action?: string;
      description?: string;
      start?: string;
      end?: string;
      interruptionId?: string;
      shifts?: IfoodShift[];
    };
    if (!b.id) return badRequest('informe a loja');
    const { token } = await getValidIfoodAccessToken(adminDb(), ctx.restaurantId);
    if (!(await ownMerchant(token, b.id))) return forbidden('loja não vinculada a esta conta');

    if (b.action === 'pause') {
      const start = new Date(b.start ?? '');
      const end = new Date(b.end ?? '');
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return badRequest('informe início e fim');
      if (end <= start) return badRequest('o fim precisa ser depois do início');
      if (end.getTime() - start.getTime() > 7 * 864e5) return badRequest('a pausa pode durar no máximo 7 dias');
      const created = await createIfoodInterruption(token, b.id, {
        description: (b.description ?? '').trim() || 'Pausa pelo Leeva',
        start: toLocalIso(start),
        end: toLocalIso(end),
      });
      return json({ ok: true, interruption: created });
    }

    if (b.action === 'unpause') {
      if (!b.interruptionId) return badRequest('informe a pausa');
      await deleteIfoodInterruption(token, b.id, b.interruptionId);
      return json({ ok: true });
    }

    if (b.action === 'hours') {
      const shifts = (b.shifts ?? []).filter(
        (s) => DAYS.includes(s.dayOfWeek) && /^\d{2}:\d{2}(:\d{2})?$/.test(s.start) && s.duration > 0 && s.duration <= 24 * 60,
      );
      if (!shifts.length) return badRequest('informe pelo menos um turno');
      await putIfoodOpeningHours(
        token,
        b.id,
        shifts.map((s) => ({ dayOfWeek: s.dayOfWeek, start: s.start.length === 5 ? `${s.start}:00` : s.start, duration: Math.round(s.duration) })),
      );
      return json({ ok: true, openingHours: await getIfoodOpeningHours(token, b.id) });
    }

    return badRequest('ação inválida');
  } catch (e) {
    return ifoodError(e);
  }
}

/** ISO no fuso de João Pessoa (-03:00), como o iFood espera nas pausas. */
function toLocalIso(d: Date) {
  const local = new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 19);
  return `${local}-03:00`;
}
