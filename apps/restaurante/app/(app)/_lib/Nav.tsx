'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

const I = {
  orders: (
    <>
      <path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z" />
      <path d="M3.5 7.5 12 12l8.5-4.5M12 12v9" />
    </>
  ),
  map: (
    <>
      <path d="M9 3 3.5 5v16L9 19l6 2 5.5-2V3L15 5 9 3z" />
      <path d="M9 3v16M15 5v16" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </>
  ),
  money: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.6" />
    </>
  ),
  plug: (
    <>
      <path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0z" />
      <path d="M12 17v4" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </>
  ),
  scooter: (
    <>
      <circle cx="6" cy="17" r="2.5" />
      <circle cx="18" cy="17" r="2.5" />
      <path d="M8.5 17h7l2-7h2M6 10h5l3 7M13 6h3" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
} as const;

type IconKey = keyof typeof I;

function Icon({ k }: { k: IconKey }): ReactNode {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {I[k]}
    </svg>
  );
}

/** Menu: o mapa ao vivo é a tela principal; o mapa de calor abre por Indicadores. */
const NAV: { href: string; label: string; icon: IconKey }[] = [
  { href: '/dashboard', label: 'Ao vivo', icon: 'map' },
  { href: '/pedidos', label: 'Pedidos', icon: 'orders' },
  { href: '/equipe', label: 'Motoboys', icon: 'scooter' },
  { href: '/escalas', label: 'Escalas', icon: 'calendar' },
  { href: '/indicadores', label: 'Indicadores', icon: 'chart' },
  { href: '/financeiro', label: 'Acerto e financeiro', icon: 'money' },
  { href: '/integracoes', label: 'Integrações', icon: 'plug' },
  { href: '/configuracoes', label: 'Configurações', icon: 'gear' },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <>
      {NAV.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          className={`side-link ${pathname.startsWith(n.href) ? 'active' : ''}`}
        >
          <Icon k={n.icon} />
          {n.label}
        </Link>
      ))}
    </>
  );
}
