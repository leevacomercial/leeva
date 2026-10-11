import { getApiContext, adminDb } from '@/lib/context';
import { json, unauthorized, badRequest, notFound, businessError, serverError, UUID } from '@/lib/api';
import { listShifts, createShift, deleteShift, copyWeekToNext, DEFAULT_LOGISTICS_CONFIG } from '@leeva/shared/services';
import type { Database, LogisticsConfig } from '@leeva/shared/types';

const MAX_RANGE_MS = 15 * 86_400_000;

/** GET /api/shifts?from=ISO&to=ISO — turnos da equipe no intervalo. */
export async function GET(req: Request) {
  const ctx = await getApiContext();
  if (!ctx) return unauthorized();
  try {
    const url = new URL(req.url);
    const from = new Date(url.searchParams.get('from') ?? '');
    const to = new Date(url.searchParams.get('to') ?? '');
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to <= from)
      return badRequest('intervalo inválido');
    if (to.getTime() - from.getTime() > MAX_RANGE_MS) return badRequest('intervalo grande demais');
    const shifts = await listShifts(adminDb(), ctx.restaurantId, from.toISOString(), to.toISOString());
    return json({ shifts });
  } catch (e) {
    return serverError(e);
  }
}

/**
 * POST /api/shifts
 *  { action: 'create', motoboyId, startsAt, endsAt, note? }
 *  { action: 'delete', id }
 *  { action: 'copy_week', weekStart }   — repete a semana na seguinte
 *  { action: 'enforce', enabled }       — despachar só pra quem está de turno
 */
export async function POST(req: Request) {
  const ctx = await getApiContext();
  if (!ctx) return unauthorized();
  try {
    const db = adminDb();
    const b = (await req.json().catch(() => ({}))) as {
      action?: string;
      id?: string;
      motoboyId?: string;
      startsAt?: string;
      endsAt?: string;
      note?: string;
      weekStart?: string;
      enabled?: boolean;
    };

    switch (b.action) {
      case 'create': {
        if (!b.motoboyId || !UUID.test(b.motoboyId)) return badRequest('escolha o motoboy');
        const r = await createShift(db, ctx.restaurantId, {
          motoboyId: b.motoboyId,
          startsAt: b.startsAt ?? '',
          endsAt: b.endsAt ?? '',
          note: b.note,
        });
        return r.ok ? json({ ok: true, id: r.id }) : businessError(r.error);
      }
      case 'delete': {
        if (!b.id || !UUID.test(b.id)) return badRequest('id inválido');
        return (await deleteShift(db, ctx.restaurantId, b.id)) ? json({ ok: true }) : notFound('turno não encontrado');
      }
      case 'copy_week': {
        const r = await copyWeekToNext(db, ctx.restaurantId, b.weekStart ?? '');
        return json({ ok: true, ...r });
      }
      case 'enforce': {
        const { data: rst } = await db
          .from('restaurants')
          .select('logistics_config')
          .eq('id', ctx.restaurantId)
          .maybeSingle();
        const cfg: LogisticsConfig = {
          ...DEFAULT_LOGISTICS_CONFIG,
          ...((rst?.logistics_config as object) ?? {}),
          shifts_enforced: b.enabled === true,
        };
        await db
          .from('restaurants')
          .update({
            logistics_config: cfg as unknown as Database['public']['Tables']['restaurants']['Update']['logistics_config'],
          })
          .eq('id', ctx.restaurantId);
        return json({ ok: true, enabled: cfg.shifts_enforced });
      }
      default:
        return badRequest('ação inválida');
    }
  } catch (e) {
    return serverError(e);
  }
}
