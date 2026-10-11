import { redirect } from 'next/navigation';
import { requireRestaurantContext, adminDb } from '@/lib/context';
import { ensureSubscription } from '@leeva/shared/services';
import { logout } from '../login/actions';
import { Nav } from './_lib/Nav';
import { ThemeToggle } from './_lib/ThemeToggle';
import { EmailGate } from './_lib/EmailGate';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireRestaurantContext();

  // e-mail precisa estar confirmado antes de usar o painel
  if (!ctx.emailConfirmed) {
    return <EmailGate email={ctx.email} />;
  }

  const db = adminDb();

  // onboarding obrigatório antes de usar o painel
  const { data: rst } = await db
    .from('restaurants')
    .select('onboarding_completed')
    .eq('id', ctx.restaurantId)
    .maybeSingle();

  await ensureSubscription(db, ctx.restaurantId).catch(() => {});

  if (!rst?.onboarding_completed) {
    redirect('/onboarding');
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          Leeva
          <small>{ctx.restaurantName}</small>
        </div>
        <Nav />
        <div className="spacer" />
        <div className="side-foot">
          {ctx.fullName ?? ctx.email}
          <ThemeToggle />
          <form action={logout} style={{ marginTop: 6 }}>
            <button className="btn sm" type="submit" style={{ width: '100%' }}>
              Sair
            </button>
          </form>
        </div>
      </aside>
      <main className="main-area">{children}</main>
    </div>
  );
}
