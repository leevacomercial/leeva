'use client';

import { Suspense, useActionState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { activateMotoboy, type ActivateState } from './actions';

const initial: ActivateState = {};

/**
 * Ativação pelo convite da loja: o link do WhatsApp já traz o telefone e o
 * código (?tel=…&codigo=…). O motoboy só escolhe e-mail e senha.
 */
function AtivarForm() {
  const [state, action, pending] = useActionState(activateMotoboy, initial);
  const sp = useSearchParams();
  const tel = sp.get('tel') ?? '';
  const codigo = sp.get('codigo') ?? '';

  return (
    <div className="screen">
      <h1>Ativar conta</h1>
      <p className="muted">
        A loja te mandou um convite pelo WhatsApp. Confira o telefone e o código e escolha seu e-mail e senha — é com eles
        que você entra no app. Você só vai ver as entregas dessa loja.
      </p>

      <form action={action} className="panel grid" style={{ marginTop: 16 }}>
        <label>
          Telefone (com DDD)
          <input className="input" name="phone" inputMode="tel" defaultValue={tel} required />
        </label>
        <label>
          Código do convite (6 números)
          <input className="input" name="codigo" inputMode="numeric" maxLength={6} defaultValue={codigo} required />
        </label>
        <label>
          E-mail
          <input className="input" type="email" name="email" required />
        </label>
        <label>
          Criar senha
          <input className="input" type="password" name="password" minLength={6} required />
        </label>

        {state.error && <p style={{ color: 'var(--danger)' }}>{state.error}</p>}

        <button className="button" type="submit" disabled={pending}>
          {pending ? 'Ativando…' : 'Ativar e entrar'}
        </button>
      </form>

      <p className="muted" style={{ marginTop: 16 }}>
        Já ativou? <Link href="/login">Entrar</Link>
      </p>
    </div>
  );
}

export default function AtivarPage() {
  return (
    <Suspense>
      <AtivarForm />
    </Suspense>
  );
}
