import { getMotoboyContextFromReq, adminDb } from '@/lib/context';
import { json, unauthorized, serverError } from '@/lib/api';
import { getActiveTerms, needsTermsAcceptance, isIfoodLogisticsLinked } from '@leeva/shared/services';

/**
 * Perfil do motoboy para o app nativo — inclui o estado de aprovação e se
 * ele ainda precisa aceitar os termos (o gate que a versão PWA faz no layout).
 */
export async function GET(req: Request) {
  const ctx = await getMotoboyContextFromReq(req);
  if (!ctx) return unauthorized();
  try {
    const db = adminDb();
    const { data: m } = await db
      .from('motoboys')
      .select(
        'id, full_name, phone, status, rating, deliveries_completed, deliveries_total, pix_key, pix_key_type, city, push_enabled',
      )
      .eq('id', ctx.motoboyId)
      .maybeSingle();

    const terms = await getActiveTerms(db);
    const needsTerms = !!terms && needsTermsAcceptance(ctx.termsAcceptedVersion, terms.version);

    return json({
      motoboyId: ctx.motoboyId,
      fullName: m?.full_name ?? ctx.fullName,
      phone: m?.phone ?? null,
      status: m?.status ?? ctx.status,
      approvalStatus: ctx.approvalStatus,
      approvalReason: ctx.approvalReason,
      rating: m?.rating != null ? Number(m.rating) : null,
      deliveriesCompleted: m?.deliveries_completed ?? 0,
      deliveriesTotal: m?.deliveries_total ?? 0,
      pixKey: m?.pix_key ?? null,
      pixKeyType: m?.pix_key_type ?? null,
      city: m?.city ?? null,
      pushEnabled: !!m?.push_enabled,
      // loja com iFood integrado (módulo Logistics): o código de entrega do iFood é digitado no app
      ifoodLogistics: ctx.restaurantId ? await isIfoodLogisticsLinked(db, ctx.restaurantId) : false,
      terms: needsTerms && terms ? { version: terms.version, content: terms.content } : null,
    });
  } catch (e) {
    return serverError(e);
  }
}
