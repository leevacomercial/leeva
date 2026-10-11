'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiPost } from '../_lib/client';

type Plan = {
  id: string;
  code: string;
  name: string;
  monthly_price: number;
  per_delivery_price: number;
  per_delivery_margin: number;
  trial_days: number;
  sort_order: number;
  active: boolean;
  features: Record<string, unknown>;
};

export function PlansEditor({ initial }: { initial: Plan[] }) {
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>(initial);
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  function update(i: number, patch: Partial<Plan>) {
    setPlans((p) => p.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }

  async function save(p: Plan) {
    setSaving(p.id);
    setMsg(null);
    try {
      let features = p.features;
      if (typeof p.features === 'string') features = JSON.parse(p.features);
      await apiPost('/api/plans', { ...p, features });
      setMsg(`Plano ${p.name} salvo.`);
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'erro ao salvar');
    } finally {
      setSaving(null);
    }
  }

  async function addPlan() {
    const code = window.prompt('Código do novo plano (ex: enterprise):')?.trim();
    if (!code) return;
    setSaving('new');
    try {
      await apiPost('/api/plans', {
        code,
        name: code[0]!.toUpperCase() + code.slice(1),
        monthly_price: 0,
        per_delivery_price: 0,
        per_delivery_margin: 0,
        trial_days: 14,
        sort_order: plans.length + 1,
        active: false,
        features: {},
      });
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'erro');
    } finally {
      setSaving(null);
    }
  }

  return (
    <>
      {msg && <div className="op-alert ok" style={{ marginBottom: 12 }}>{msg}</div>}
      {plans.map((p, i) => (
        <div className="card" key={p.id}>
          <div className="card-title">
            {p.name} <span className="muted">({p.code})</span>{' '}
            {!p.active && <span className="tag gray">inativo</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
            <label>Nome<input className="input" value={p.name} onChange={(e) => update(i, { name: e.target.value })} /></label>
            <label>Mensalidade (R$)<input className="input" type="number" step="0.01" value={p.monthly_price} onChange={(e) => update(i, { monthly_price: Number(e.target.value) })} /></label>
            <label>Valor por entrega (R$)<input className="input" type="number" step="0.01" value={p.per_delivery_price} onChange={(e) => update(i, { per_delivery_price: Number(e.target.value) })} /></label>
            <label>Trial (dias)<input className="input" type="number" value={p.trial_days} onChange={(e) => update(i, { trial_days: Number(e.target.value) })} /></label>
            <label>Ordem<input className="input" type="number" value={p.sort_order} onChange={(e) => update(i, { sort_order: Number(e.target.value) })} /></label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 20 }}>
              <input type="checkbox" checked={p.active} onChange={(e) => update(i, { active: e.target.checked })} /> Ativo
            </label>
          </div>
          <label style={{ display: 'block', marginTop: 10 }}>
            Features (JSON)
            <textarea
              className="input"
              rows={5}
              style={{ fontFamily: 'monospace', fontSize: 12 }}
              value={typeof p.features === 'string' ? p.features : JSON.stringify(p.features, null, 2)}
              onChange={(e) => update(i, { features: e.target.value as never })}
            />
          </label>
          <button className="btn" onClick={() => save(p)} disabled={saving === p.id} style={{ marginTop: 10 }}>
            {saving === p.id ? 'Salvando…' : 'Salvar plano'}
          </button>
        </div>
      ))}
      <button className="btn" onClick={addPlan} disabled={saving === 'new'}>+ Novo plano</button>
    </>
  );
}
