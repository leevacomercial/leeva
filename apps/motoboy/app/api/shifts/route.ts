import { getMotoboyContextFromReq, adminDb } from '@/lib/context';
import { json, unauthorized, serverError } from '@/lib/api';
import { listMotoboyShifts, isShiftActive } from '@leeva/shared/services';

/** GET /api/shifts — próximos turnos do motoboy (14 dias), para o PWA e o app nativo. */
export async function GET(req: Request) {
  const ctx = await getMotoboyContextFromReq(req);
  if (!ctx) return unauthorized();
  try {
    const shifts = await listMotoboyShifts(adminDb(), ctx.motoboyId);
    const now = new Date();
    return json({
      shifts: shifts.map((s) => ({ ...s, active: isShiftActive(s, now) })),
    });
  } catch (e) {
    return serverError(e);
  }
}
