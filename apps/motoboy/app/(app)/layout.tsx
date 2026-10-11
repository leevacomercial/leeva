import { requireMotoboyContext, adminDb } from '@/lib/context';
import { getActiveTerms, needsTermsAcceptance } from '@leeva/shared/services';
import LocationSender from './LocationSender';
import OffersPanel from './OffersPanel';
import { OnboardingGate } from './_lib/OnboardingGate';
import { TabBar } from './_lib/TabBar';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireMotoboyContext();

  // GATE: conta bloqueada (reprovada) ou termos de uso pendentes.
  if (ctx.approvalStatus === 'rejected')
    return <OnboardingGate state="rejected" reason={ctx.approvalReason} />;
  const terms = await getActiveTerms(adminDb());
  if (terms && needsTermsAcceptance(ctx.termsAcceptedVersion, terms.version))
    return <OnboardingGate state="terms" terms={terms} />;

  return (
    <div className="screen">
      {children}

      <OffersPanel motoboyId={ctx.motoboyId} />
      <LocationSender active={ctx.status !== 'offline'} />

      <TabBar />
    </div>
  );
}
