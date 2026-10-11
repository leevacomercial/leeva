import { adminDb } from '@/lib/context';
import { DEFAULT_PAYOUT_CONFIG } from '@leeva/shared/services';
import { PlansEditor } from './PlansEditor';
import { FeeTableEditor } from './FeeTableEditor';

export const dynamic = 'force-dynamic';

export default async function Planos() {
  const db = adminDb();
  const [{ data: plans }, { data: policy }] = await Promise.all([
    db.from('plans').select('*').order('sort_order'),
    db.from('payout_policies').select('config').is('restaurant_id', null).maybeSingle(),
  ]);
  const cfg = { ...DEFAULT_PAYOUT_CONFIG, ...((policy?.config as object) ?? {}) };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Planos</h1>
          <div className="sub">Mensalidades e a tabela padrão de pagamento do motoboy — muda sem deploy</div>
        </div>
      </div>

      <FeeTableEditor
        initial={{
          per_km: Number(cfg.per_km),
          per_km_grouped: Number(cfg.per_km_grouped),
          min_payout: Number(cfg.min_payout),
          group_radius_km: Number(cfg.group_radius_km ?? 1),
          group_max_stops: Number(cfg.group_max_stops ?? 3),
        }}
      />

      <div className="card-title" style={{ marginTop: 8 }}>Planos SaaS</div>
      <PlansEditor initial={(plans ?? []) as never} />
      <p className="muted" style={{ fontSize: 12 }}>
        O Leeva cobra só a <b>mensalidade</b> — não há valor por entrega. A tabela do motoboy acima é só o
        padrão que cada restaurante novo recebe; ele mesmo ajusta em Configurações e paga a própria equipe. As
        <code> features</code> controlam o que cada plano libera.
      </p>
    </>
  );
}
