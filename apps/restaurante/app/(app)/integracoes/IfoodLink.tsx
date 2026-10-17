'use client';

import { useEffect, useState } from 'react';

type LinkStatus = {
  linkStatus: 'not_linked' | 'pending' | 'linked' | 'error';
  mode?: 'distributed' | 'centralized';
  userCode?: string;
  verificationUrl?: string;
  verificationUrlComplete?: string;
  userCodeExpiresAt?: string;
  merchantIds?: string[];
  linkedAt?: string;
  lastError?: string;
};

/**
 * Vínculo com o iFood — fluxo authorization_code + userCode (apps
 * distribuídos, como o Leeva, não usam client_credentials). O dono do
 * restaurante gera um código aqui, autoriza no Portal do Parceiro do iFood,
 * e volta pra confirmar.
 */
export function IfoodLink() {
  const [status, setStatus] = useState<LinkStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showCentralForm, setShowCentralForm] = useState(false);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');

  async function load() {
    const res = await fetch('/api/ifood/link', { cache: 'no-store' });
    if (res.ok) setStatus(await res.json());
  }
  useEffect(() => {
    load();
  }, []);

  async function act(action: 'start' | 'complete' | 'unlink', extra?: Record<string, string>) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/ifood/link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      const d = (await res.json()) as LinkStatus & { error?: string };
      if (!res.ok) throw new Error(d.error ?? 'erro');
      setStatus(d);
      if (action === 'complete' && d.linkStatus === 'pending') {
        setErr('Ainda não vi a autorização no Portal do Parceiro. Conclua lá e clique em "Concluir vínculo" de novo.');
      }
      if (d.linkStatus === 'linked') {
        setShowCentralForm(false);
        setClientId('');
        setClientSecret('');
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'erro');
    } finally {
      setBusy(false);
    }
  }

  async function linkCentralized() {
    if (!clientId.trim() || !clientSecret.trim()) {
      setErr('Preencha o Client ID e o Client Secret.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/ifood/link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'link_centralized', clientId: clientId.trim(), clientSecret: clientSecret.trim() }),
      });
      const d = (await res.json()) as LinkStatus & { error?: string };
      if (!res.ok || d.linkStatus === 'error') throw new Error(d.error ?? d.lastError ?? 'erro ao vincular');
      setStatus(d);
      setShowCentralForm(false);
      setClientId('');
      setClientSecret('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'erro');
    } finally {
      setBusy(false);
    }
  }

  if (!status) return null;

  return (
    <section className="panel">
      <h2 style={{ fontSize: 15, marginTop: 0 }}>iFood</h2>
      <p className="muted" style={{ fontSize: 13 }}>
        O app do Leeva é distribuído (um app pra muitos restaurantes) — o iFood exige que{' '}
        <b>cada restaurante</b> autorize o vínculo pelo Portal do Parceiro, não uma chave só.
      </p>

      {err && <div className="op-alert critical" style={{ marginTop: 8 }}>{err}</div>}

      {status.linkStatus === 'not_linked' && !showCentralForm && (
        <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="button" style={{ width: 'auto' }} disabled={busy} onClick={() => act('start')}>
            {busy ? '…' : 'Vincular com o iFood'}
          </button>
          <button className="button secondary" style={{ width: 'auto' }} disabled={busy} onClick={() => setShowCentralForm(true)}>
            Já tenho um app Centralizado meu
          </button>
        </div>
      )}

      {status.linkStatus !== 'linked' && showCentralForm && (
        <div style={{ marginTop: 10 }}>
          <p className="muted" style={{ fontSize: 12 }}>
            Cole o Client ID e o Client Secret do app tipo <b>Centralizado</b> que você criou no
            Portal Desenvolvedor do iFood, já ligado à sua loja.
          </p>
          <div style={{ display: 'grid', gap: 8, maxWidth: 420 }}>
            <input
              className="input"
              placeholder="Client ID"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            />
            <input
              className="input"
              placeholder="Client Secret"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
            />
          </div>
          <div className="row" style={{ marginTop: 10, gap: 8 }}>
            <button className="button" style={{ width: 'auto' }} disabled={busy} onClick={linkCentralized}>
              {busy ? '…' : 'Vincular'}
            </button>
            <button className="button secondary" style={{ width: 'auto' }} disabled={busy} onClick={() => setShowCentralForm(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {status.linkStatus === 'pending' && !showCentralForm && (
        <div style={{ marginTop: 10 }}>
          <div className="op-alert info">
            <div style={{ fontWeight: 700, fontSize: 20, letterSpacing: '0.05em' }}>{status.userCode}</div>
            <div style={{ marginTop: 6, fontSize: 13 }}>
              1. Abra{' '}
              <a href={status.verificationUrlComplete || status.verificationUrl} target="_blank" rel="noreferrer">
                o Portal do Parceiro do iFood
              </a>
              , logado com a conta do seu restaurante.
              <br />
              2. Se pedir, digite o código acima e autorize o app <b>Leeva</b>.
              <br />
              3. Volte aqui e clique em &quot;Concluir vínculo&quot;.
            </div>
          </div>
          <div className="row" style={{ marginTop: 10, gap: 8 }}>
            <button className="button" style={{ width: 'auto' }} disabled={busy} onClick={() => act('complete')}>
              {busy ? '…' : 'Concluir vínculo'}
            </button>
            <button className="button secondary" style={{ width: 'auto' }} disabled={busy} onClick={() => act('unlink')}>
              Cancelar
            </button>
            <button className="button secondary" style={{ width: 'auto' }} disabled={busy} onClick={() => setShowCentralForm(true)}>
              Usar um app Centralizado
            </button>
          </div>
        </div>
      )}

      {status.linkStatus === 'linked' && (
        <div style={{ marginTop: 10 }}>
          <div className="op-alert ok">
            Vinculado{status.mode === 'centralized' ? ' (app Centralizado próprio)' : ''}
            {status.linkedAt ? ` em ${new Date(status.linkedAt).toLocaleString('pt-BR')}` : ''}.
            {status.merchantIds?.length ? ` Merchant(s): ${status.merchantIds.join(', ')}` : ''}
          </div>
          <button className="button secondary" style={{ width: 'auto', marginTop: 10 }} disabled={busy} onClick={() => act('unlink')}>
            Desvincular
          </button>
        </div>
      )}

      {status.linkStatus === 'error' && (
        <div style={{ marginTop: 10 }}>
          <div className="op-alert critical">{status.lastError ?? 'Falha no vínculo.'}</div>
          <div className="row" style={{ marginTop: 10, gap: 8 }}>
            <button className="button" style={{ width: 'auto' }} disabled={busy} onClick={() => act('start')}>
              {busy ? '…' : 'Tentar de novo'}
            </button>
            {!showCentralForm && (
              <button className="button secondary" style={{ width: 'auto' }} disabled={busy} onClick={() => setShowCentralForm(true)}>
                Usar um app Centralizado
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
