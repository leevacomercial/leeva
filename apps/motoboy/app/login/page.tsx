'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { login, type LoginState } from './actions';

const initial: LoginState = {};

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, initial);

  return (
    <div className="screen">
      <h1>Leeva Motoboy</h1>
      <p className="muted">Entre para começar a receber entregas.</p>

      <form action={action} className="panel grid" style={{ marginTop: 16 }}>
        <label>
          E-mail
          <input className="input" type="email" name="email" required />
        </label>
        <label>
          Senha
          <input className="input" type="password" name="password" required />
        </label>

        {state.error && <p style={{ color: 'var(--danger)' }}>{state.error}</p>}

        <button className="button" type="submit" disabled={pending}>
          {pending ? 'Entrando…' : 'Entrar'}
        </button>
        <Link href="/esqueci-senha" className="muted" style={{ fontSize: 13 }}>
          Esqueci minha senha
        </Link>
      </form>

      <p className="muted" style={{ marginTop: 16 }}>
        Primeiro acesso? Peça o convite ao estabelecimento onde você trabalha e <Link href="/ativar">ative sua conta aqui</Link>.
      </p>
    </div>
  );
}
