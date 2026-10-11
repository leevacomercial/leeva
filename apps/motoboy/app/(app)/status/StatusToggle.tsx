'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Bike } from 'lucide-react';
import { formatCurrencyBRL, type MotoboyStatus } from '@leeva/shared';
import Avatar from '../_lib/Avatar';

export default function StatusToggle({
  fullName,
  initialStatus,
  activeDeliveries,
  doneToday,
  earnedToday,
  kmToday,
  approved,
}: {
  restaurantId: string | null;
  motoboyId: string;
  fullName: string;
  initialStatus: MotoboyStatus;
  activeDeliveries: number;
  doneToday: number;
  earnedToday: number;
  kmToday: number;
  approved: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<MotoboyStatus>(initialStatus);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const online = status !== 'offline';

  async function toggle() {
    if (!approved) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/status', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ online: !online }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStatus(data.status);
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="home-topbar">
        <Link href="/perfil" className="home-avatar-btn">
          <Avatar name={fullName} src={null} size={38} />
        </Link>
        <span className="home-topbar-name">{fullName}</span>
      </div>

      <div className="home-status-card">
        <div className="home-map-backdrop" aria-hidden />

        <div className="home-status-content">
          {!approved ? (
            <>
              <div className="home-idle-icon">
                <Bike size={30} strokeWidth={2} />
              </div>
              <div className="home-status-title">Cadastro em análise</div>
              <p className="home-status-subtitle">
                Complete seus dados e aguarde a aprovação pra poder ficar disponível.
              </p>
            </>
          ) : online ? (
            <>
              <div className="home-radar">
                <span className="home-radar-ring" />
                <span className="home-radar-ring" />
                <span className="home-radar-ring" />
                <span className="home-radar-core">
                  <Bike size={30} strokeWidth={2.2} />
                </span>
              </div>
              <div className="home-status-title">Procurando entregas</div>
              <p className="home-status-subtitle">
                Você está disponível — assim que surgir um pedido perto, a gente te avisa.
              </p>
            </>
          ) : (
            <>
              <div className="home-idle-icon">
                <Bike size={30} strokeWidth={2} />
              </div>
              <div className="home-status-title">Você está indisponível</div>
              <p className="home-status-subtitle">Toque no botão abaixo para começar a receber entregas.</p>
            </>
          )}
        </div>

        {approved ? (
          <button type="button" className={`home-toggle-btn ${online ? 'on' : 'off'}`} onClick={toggle} disabled={busy}>
            {busy ? 'Um instante…' : online ? 'Ficar indisponível' : 'Ficar disponível'}
          </button>
        ) : (
          <p className="muted" style={{ textAlign: 'center', margin: '12px 16px' }}>
            Sua conta está bloqueada. Fale com o estabelecimento.
          </p>
        )}
      </div>

      {err && <p style={{ color: 'var(--danger)', margin: 0, textAlign: 'center' }}>{err}</p>}

      <div className="home-sheet">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <strong style={{ fontSize: 14 }}>Resumo do dia</strong>
          <Link href="/historico" className="muted" style={{ fontSize: 13 }}>
            Ver histórico →
          </Link>
        </div>
        <div className="row" style={{ gap: 10, marginTop: 8 }}>
          <div className="panel" style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{formatCurrencyBRL(earnedToday)}</div>
            <div className="muted" style={{ fontSize: 12 }}>a receber hoje</div>
          </div>
          <div className="panel" style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{doneToday}</div>
            <div className="muted" style={{ fontSize: 12 }}>entregas hoje</div>
          </div>
          <div className="panel" style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{kmToday.toFixed(1)} km</div>
            <div className="muted" style={{ fontSize: 12 }}>rodados hoje</div>
          </div>
        </div>

        {activeDeliveries > 0 && (
          <Link href="/entrega" className="button" style={{ textAlign: 'center', marginTop: 10 }}>
            Ver entrega atual
          </Link>
        )}
      </div>
    </div>
  );
}
