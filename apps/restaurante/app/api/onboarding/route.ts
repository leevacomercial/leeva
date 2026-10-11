import { getApiContext, adminDb } from '@/lib/context';
import { json, unauthorized, badRequest, serverError } from '@/lib/api';
import {
  ensureSubscription,
  changePlan,
  DEFAULT_LOGISTICS_CONFIG,
  resolvePickupLocation,
  deliveryLocationErrorMessage,
} from '@leeva/shared/services';
import { sanitizeBusinessHours } from '@leeva/shared/services/business-hours';

export async function POST(req: Request) {
  const ctx = await getApiContext();
  if (!ctx) return unauthorized();
  try {
    const b = (await req.json().catch(() => ({}))) as {
      name?: string;
      address?: string;
      latitude?: number;
      longitude?: number;
      fleetMode?: string;
      businessHours?: unknown;
      expectedDailyOrders?: number | null;
      planCode?: string;
      addressConfirmed?: boolean;
    };
    if (!b.name?.trim() || !b.address?.trim()) return badRequest('nome e endereço obrigatórios');

    const db = adminDb();

    // o endereço do restaurante (ponto de coleta) precisa ser localizável —
    // toda tarifa de entrega é calculada a partir dele.
    const pickup = await resolvePickupLocation({
      address: b.address.trim(),
      latitude: b.latitude,
      longitude: b.longitude,
      confirmed: b.addressConfirmed === true,
    });
    if (!pickup.ok) {
      const msg =
        pickup.reason === 'geocoder_unavailable'
          ? deliveryLocationErrorMessage(pickup.reason)
          : 'Não conseguimos localizar o endereço do seu restaurante. Confira a rua, o número e o bairro.';
      return json({ error: msg, code: pickup.reason }, pickup.reason === 'geocoder_unavailable' ? 503 : 400);
    }
    const fleetMode = 'own' as const;

    const businessHours = sanitizeBusinessHours(b.businessHours);
    const expectedDailyOrders =
      b.expectedDailyOrders != null && Number.isFinite(Number(b.expectedDailyOrders))
        ? Math.max(0, Math.round(Number(b.expectedDailyOrders)))
        : null;

    await db
      .from('restaurants')
      .update({
        name: b.name.trim().slice(0, 200),
        address: b.address.trim().slice(0, 500),
        latitude: pickup.latitude,
        longitude: pickup.longitude,
        fleet_mode: fleetMode,
        logistics_config: { ...DEFAULT_LOGISTICS_CONFIG },
        business_hours: businessHours as never,
        expected_daily_orders: expectedDailyOrders,
        onboarding_completed: true,
      })
      .eq('id', ctx.restaurantId);

    await ensureSubscription(db, ctx.restaurantId, b.planCode ?? undefined);
    if (b.planCode) await changePlan(db, ctx.restaurantId, b.planCode);

    return json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
