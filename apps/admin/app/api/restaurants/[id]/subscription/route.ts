import { getAdminApiContext, adminDb } from '@/lib/context';
import { json, unauthorized, badRequest, businessError, serverError, UUID } from '@/lib/api';
import { applySubscriptionAction, type SubscriptionAction } from '@leeva/shared/services';

export const dynamic = 'force-dynamic';

/**
 * Gestão manual da assinatura (a cobrança é feita por fora — Pix/boleto).
 * body: { action: 'mark_paid' | 'past_due' | 'cancel' }
 *     | { action: 'extend_trial', days }
 *     | { action: 'change_plan', planCode }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAdminApiContext();
  if (!ctx) return unauthorized();
  const { id } = await params;
  if (!UUID.test(id)) return badRequest('id inválido');

  const b = (await req.json().catch(() => ({}))) as { action?: string; days?: number; planCode?: string };
  let act: SubscriptionAction;
  switch (b.action) {
    case 'mark_paid':
    case 'past_due':
    case 'cancel':
      act = { action: b.action };
      break;
    case 'extend_trial':
      act = { action: 'extend_trial', days: Number(b.days) };
      break;
    case 'change_plan':
      if (!b.planCode) return badRequest('escolha o plano');
      act = { action: 'change_plan', planCode: b.planCode };
      break;
    default:
      return badRequest('ação inválida');
  }

  try {
    const r = await applySubscriptionAction(adminDb(), id, act);
    return r.ok ? json({ ok: true }) : businessError(r.error);
  } catch (e) {
    return serverError(e);
  }
}
