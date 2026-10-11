import { requireMotoboyContext, adminDb } from '@/lib/context';
import StatusToggle from './StatusToggle';
import NotificationSetup from '../_lib/NotificationSetup';
import MyShifts from './MyShifts';
import { listMotoboyShifts } from '@leeva/shared/services';

export const dynamic = 'force-dynamic';

export default async function StatusPage() {
  const ctx = await requireMotoboyContext();
  const db = adminDb();
  const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

  const [{ count: activeCount }, { data: deliveredToday }, shifts] = await Promise.all([
    db
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('motoboy_id', ctx.motoboyId)
      .in('status', ['assigned', 'picked_up', 'in_route']),
    db
      .from('orders')
      .select('route_distance_km, driver_payout')
      .eq('motoboy_id', ctx.motoboyId)
      .eq('status', 'delivered')
      .gte('delivered_at', todayStart),
    listMotoboyShifts(db, ctx.motoboyId, 7).catch(() => []),
  ]);

  // quanto o estabelecimento deve a ele pelas entregas de hoje (acerto é direto com o estabelecimento)
  const earnedToday = (deliveredToday ?? []).reduce((s, o) => s + Number(o.driver_payout ?? 0), 0);
  const kmToday = (deliveredToday ?? []).reduce((s, o) => s + Number(o.route_distance_km ?? 0), 0);

  return (
    <div className="grid" style={{ gap: 16 }}>
      <StatusToggle
        restaurantId={ctx.restaurantId}
        motoboyId={ctx.motoboyId}
        fullName={ctx.fullName ?? 'Entregador'}
        initialStatus={ctx.status}
        activeDeliveries={activeCount ?? 0}
        doneToday={(deliveredToday ?? []).length}
        earnedToday={earnedToday}
        kmToday={kmToday}
        approved={ctx.approvalStatus === 'approved'}
      />
      <MyShifts shifts={shifts} />
      <NotificationSetup askNow={ctx.status !== 'offline'} />
    </div>
  );
}
