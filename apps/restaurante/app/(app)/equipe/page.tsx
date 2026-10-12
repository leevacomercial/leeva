import { requireRestaurantContext, adminDb } from '@/lib/context';
import { MOTOBOY_STATUS_LABELS, formatDateTime } from '@leeva/shared';
import TeamManager from './TeamManager';

export const dynamic = 'force-dynamic';

export default async function EquipePage() {
  const ctx = await requireRestaurantContext();
  const db = adminDb();

  const { data: rst } = await db.from('restaurants').select('name').eq('id', ctx.restaurantId).maybeSingle();

  const { data: team } = await db
    .from('motoboys')
    .select('id, full_name, phone, cpf, pix_key, status, active, user_id, deliveries_completed, deliveries_late, avg_delay_min, rating, location_updated_at')
    .eq('restaurant_id', ctx.restaurantId)
    .eq('fleet', 'own')
    .order('full_name');

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Motoboys</h1>
          <div className="sub">Sua equipe. O Leeva manda as entregas e a rota pro app deles, e você acompanha todo mundo em Ao vivo.</div>
        </div>
      </div>
      <TeamManager
        restaurantName={rst?.name ?? ''}
        team={(team ?? []).map((m) => ({
          ...m,
          statusLabel: MOTOBOY_STATUS_LABELS[m.status],
          lastSeen: m.location_updated_at ? formatDateTime(m.location_updated_at) : null,
        }))}
      />
    </>
  );
}
