'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiPost } from '../_lib/client';

type Member = {
  id: string;
  full_name: string;
  phone: string;
  statusLabel: string;
  active: boolean;
  user_id: string | null;
  deliveries_completed: number;
  deliveries_late: number;
  avg_delay_min: number;
  rating: number;
  lastSeen: string | null;
};

const APK_URL = 'https://leeva-apk.vercel.app';
const ACTIVATE_URL = 'https://leeva-motoboy-snowy.vercel.app/ativar';

/** Convite pronto pro WhatsApp do entregador: baixar o app + ativar a conta com o telefone cadastrado. */
function inviteLink(m: Member, restaurantName: string): string {
  const digits = m.phone.replace(/\D/g, '');
  const to = digits.length <= 11 ? `55${digits}` : digits;
  const first = m.full_name.split(' ')[0];
  const text = [
    `Oi ${first}! Você foi cadastrado como entregador${restaurantName ? ` da ${restaurantName}` : ''} no Leeva. As entregas e a rota chegam pelo app.`,
    '',
    `1) Baixe o app: ${APK_URL}`,
    `2) Ative sua conta aqui com o telefone ${digits} e crie um e-mail e senha: ${ACTIVATE_URL}`,
    '3) Entre no app com esse e-mail e senha e toque em "Ficar disponível" quando estiver trabalhando.',
  ].join('\n');
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}

export default function TeamManager({ team, restaurantName }: { team: Member[]; restaurantName: string }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setErr(null);
    try {
      await apiPost('/api/team', { full_name: name, phone });
      setName('');
      setPhone('');
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(id: string, active: boolean) {
    try {
      await apiPost('/api/team', { id, active: !active });
      router.refresh();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <>
      <div className="card">
        <div className="card-title">Adicionar entregador</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input className="input" placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
          <input className="input" placeholder="Telefone (com DDD)" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
          <button className="btn primary" onClick={add} disabled={busy || !name.trim() || phone.replace(/\D/g, '').length < 10}>
            Adicionar
          </button>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          Depois de adicionar, clique em &quot;Mandar convite&quot;: abre o WhatsApp dele com o link do app e da ativação prontos.
        </p>
        {err && <div className="op-alert critical">{err}</div>}
      </div>

      <div className="card">
        <div className="card-title">Equipe ({team.length})</div>
        <table className="data">
          <thead>
            <tr><th>Nome</th><th>Status</th><th>Conta</th><th>Entregas</th><th>Atrasos</th><th>Avaliação</th><th></th></tr>
          </thead>
          <tbody>
            {team.map((m) => (
              <tr key={m.id} style={{ opacity: m.active ? 1 : 0.5 }}>
                <td>{m.full_name}<div className="muted" style={{ fontSize: 12 }}>{m.phone}</div></td>
                <td>{m.statusLabel}</td>
                <td>{m.user_id ? <span className="tag green">ativa</span> : <span className="tag amber">pendente</span>}</td>
                <td>{m.deliveries_completed}</td>
                <td>{m.deliveries_completed ? `${Math.round((m.deliveries_late / m.deliveries_completed) * 100)}%` : '—'}</td>
                <td>{Number(m.rating).toFixed(1)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {!m.user_id && (
                    <a className="btn sm primary" href={inviteLink(m, restaurantName)} target="_blank" rel="noreferrer" style={{ marginRight: 6 }}>
                      Mandar convite
                    </a>
                  )}
                  <button className="btn sm" onClick={() => toggle(m.id, m.active)}>{m.active ? 'Desativar' : 'Reativar'}</button>
                </td>
              </tr>
            ))}
            {team.length === 0 && <tr><td colSpan={7} className="muted">Nenhum entregador cadastrado.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
