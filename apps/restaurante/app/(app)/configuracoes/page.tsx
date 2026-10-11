import { requireRestaurantContext, adminDb } from '@/lib/context';
import { DEFAULT_LOGISTICS_CONFIG, getUsageSummary, getPayoutPolicy } from '@leeva/shared/services';
import type { BusinessHours } from '@leeva/shared/services/business-hours';
import ConfigForm from './ConfigForm';

export const dynamic = 'force-dynamic';

export default async function ConfiguracoesPage() {
  const ctx = await requireRestaurantContext();
  const db = adminDb();

  const [{ data: rst }, usage, { data: plans }, payout] = await Promise.all([
    db
      .from('restaurants')
      .select('name, address, phone, latitude, longitude, logistics_config, business_hours')
      .eq('id', ctx.restaurantId)
      .maybeSingle(),
    getUsageSummary(db, ctx.restaurantId),
    db
      .from('plans')
      .select('code, name, monthly_price, per_delivery_margin, features')
      .eq('active', true)
      .order('sort_order'),
    getPayoutPolicy(db, ctx.restaurantId),
  ]);

  return (
    <ConfigForm
      isOwner={ctx.role === 'restaurant_owner'}
      initial={{
        name: rst?.name ?? '',
        address: rst?.address ?? '',
        whatsapp: rst?.phone ?? '',
        latitude: rst?.latitude ?? null,
        longitude: rst?.longitude ?? null,
        logistics: { ...DEFAULT_LOGISTICS_CONFIG, ...((rst?.logistics_config as object) ?? {}) },
        businessHours: (rst?.business_hours as BusinessHours | null) ?? null,
        payout: {
          per_km: payout.per_km,
          min_payout: payout.min_payout,
          group_max_stops: payout.group_max_stops ?? 3,
          group_radius_km: payout.group_radius_km ?? 1.5,
        },
      }}
      currentPlan={usage.plan.code}
      plans={plans ?? []}
    />
  );
}
