'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiPost } from '../../_lib/client';

type Plan = { code: string; name: string; monthly_price: number };

/** Botões de cobrança manual: pago, inadimplente, estender teste, trocar plano, cancelar. */
export function SubscriptionActions({
  restaurantId,
  status,
  planCode,
  plans,
}: {
  restaurantId: string;
  status: string | null;
  planCode: string | null;
  plans: Plan[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [plan, setPlan] = useState(planCode ?? plans[0]?.code ?? '');

  async function run(body: Record<string, unknown>, done: string, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setMsg(null);
    try {
      await apiPost(`/api/restaurants/${restaurantId}/subscription`, body);
      setMsg({ ok: true, text: done });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn primary sm"
          disabled={busy}
          onClick={() => run({ action: 'mark_paid' }, 'Pagamento registrado — assinatura em dia por mais 1 mês.', 'Confirmar que esta mensalidade foi paga?')}
        >
          Marcar mensalidade como paga
        </button>
        {status !== 'past_due' && status !== 'canceled' && (
          <button type="button" className="btn sm" disabled={busy} onClick={() => run({ action: 'past_due' }, 'Marcado como inadimplente.')}>
            Marcar inadimplente
          </button>
        )}
        <button
          type="button"
          className="btn sm"
          disabled={busy}
          onClick={() => {
            const v = window.prompt('Estender o teste grátis por quantos dias?', '7');
            const days = v ? Number(v) : NaN;
            if (!Number.isFinite(days) || days <= 0) return;
            void run({ action: 'extend_trial', days }, `Teste estendido em ${days} dia(s).`);
          }}
        >
          Estender teste
        </button>
        {status !== 'canceled' && (
          <button
            type="button"
            className="btn sm"
            disabled={busy}
            style={{ color: 'var(--danger)' }}
            onClick={() => run({ action: 'cancel' }, 'Assinatura cancelada.', 'Cancelar a assinatura deste cliente?')}
          >
            Cancelar assinatura
          </button>
        )}
      </div>

      {plans.length > 1 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select className="select" value={plan} onChange={(e) => setPlan(e.target.value)} disabled={busy}>
            {plans.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name} — R$ {Number(p.monthly_price).toFixed(2).replace('.', ',')}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn sm"
            disabled={busy || plan === planCode}
            onClick={() => run({ action: 'change_plan', planCode: plan }, 'Plano alterado (a situação da cobrança não muda).')}
          >
            Trocar plano
          </button>
        </div>
      )}

      {msg && (
        <div className="muted" style={{ fontSize: 13, color: msg.ok ? 'var(--ok)' : 'var(--danger)' }} role="status">
          {msg.text}
        </div>
      )}
    </div>
  );
}
