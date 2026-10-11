import { requireRestaurantContext, adminDb } from '@/lib/context';
import ShiftBoard from './ShiftBoard';

export const dynamic = 'force-dynamic';

export default async function EscalasPage() {
  const ctx = await requireRestaurantContext();
  const db = adminDb();

  const { data: rst } = await db
    .from('restaurants')
    .select('logistics_config')
    .eq('id', ctx.restaurantId)
    .maybeSingle();

  const { data: team } = await db
    .from('motoboys')
    .select('id, full_name, status')
    .eq('restaurant_id', ctx.restaurantId)
    .eq('fleet', 'own')
    .eq('active', true)
    .order('full_name');

  const enforced = !!(rst?.logistics_config as { shifts_enforced?: boolean } | null)?.shifts_enforced;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Escalas</h1>
          <div className="sub">
            Monte os turnos da semana. Com a trava ligada, o Leeva só manda entrega pra quem está de turno.
          </div>
        </div>
      </div>
      <ShiftBoard team={team ?? []} initialEnforced={enforced} />
    </>
  );
}
