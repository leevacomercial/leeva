'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

const I = {
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  map: (
    <>
      <path d="M9 3 3.5 5v16L9 19l6 2 5.5-2V3L15 5 9 3z" />
      <path d="M9 3v16M15 5v16" />
    </>
  ),
  store: (
    <>
      <path d="M4 9h16l-1-5H5L4 9z" />
      <path d="M5 9v11h14V9M9 20v-6h6v6" />
    </>
  ),
  scooter: (
    <>
      <circle cx="6" cy="17" r="2.5" />
      <circle cx="18" cy="17" r="2.5" />
      <path d="M8.5 17h7l2-7h2M6 10h5l3 7M13 6h3" />
    </>
  ),
  ticket: (
    <>
      <path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2H6a2 2 0 0 1-2-2 2 2 0 0 0 0-4z" />
      <path d="M14 6v12" strokeDasharray="1 3" />
    </>
  ),
  star: <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9L12 3.5z" />,
} as const;

type IconKey = keyof typeof I;

const NAV: { href: string; label: string; icon: IconKey }[] = [
  { href: '/visao-geral', label: 'Visão geral', icon: 'chart' },
  { href: '/operacao', label: 'Operação', icon: 'map' },
  { href: '/restaurantes', label: 'Clientes', icon: 'store' },
  { href: '/entregadores', label: 'Motoboys', icon: 'scooter' },
  { href: '/planos', label: 'Planos', icon: 'ticket' },
];

function Icon({ k }: { k: IconKey }): ReactNode {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {I[k]}
    </svg>
  );
}

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
