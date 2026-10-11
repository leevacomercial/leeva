'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { logout } from '../../login/actions';

/** Bloqueia o app quando a conta foi reprovada ou os termos de uso estão pendentes. */
export function OnboardingGate({
  state,
  reason,
  terms,
}: {
  state: 'rejected' | 'terms';
  reason?: string | null;
  terms?: { version: number; content: string } | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function accept() {
    if (!terms) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/terms', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ version: terms.version }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'erro');
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'erro');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <div className="panel" style={{ marginTop: 24 }}>
        {state === 'rejected' && (
          <>
            <h2 style={{ marginTop: 0, color: 'var(--danger)' }}>Cadastro não aprovado</h2>
            <p>{reason || 'Seu cadastro não foi aprovado desta vez.'}</p>
            <p className="muted" style={{ fontSize: 13 }}>Fale com o suporte se tiver dúvidas.</p>
          </>
        )}

        {state === 'terms' && terms && (
          <>
            <h2 style={{ marginTop: 0 }}>Termos de uso (v{terms.version})</h2>
            <div
              style={{
                maxHeight: '45vh',
                overflowY: 'auto',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 8,
                padding: 12,
                fontSize: 13,
                whiteSpace: 'pre-wrap',
                margin: '10px 0',
              }}
            >
              {terms.content}
            </div>
            {err && <p style={{ color: 'var(--danger)' }}>{err}</p>}
            <button className="button" onClick={accept} disabled={busy}>
              {busy ? '…' : 'Li e aceito os termos'}
            </button>
          </>
        )}

        <form action={logout} style={{ marginTop: 16 }}>
          <button className="button secondary" style={{ width: 'auto', padding: '8px 12px' }}>
            Sair
          </button>
        </form>
      </div>
    </div>
  );
}
