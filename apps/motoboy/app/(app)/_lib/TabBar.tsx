'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

const I = {
  status: <path d="M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5" />,
  scooter: (
    <>
      <circle cx="6" cy="17" r="2.3" />
      <circle cx="18" cy="17" r="2.3" />
      <path d="M8.3 17h7l1.8-6.3h1.9M6 10.5h5l2.7 6.5M13 6.5h3" />
    </>
  ),
  history: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v4h4" />
      <path d="M12 8v4l3 2" />
    </>
  ),
  wallet: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
      <circle cx="16" cy="14" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </>
  ),
} as const;

type IconKey = keyof typeof I;

const TABS: { href: string; label: string; icon: IconKey }[] = [
  { href: '/status', label: 'Status', icon: 'status' },
  { href: '/entrega', label: 'Entrega', icon: 'scooter' },
  { href: '/historico', label: 'Histórico', icon: 'history' },
  { href: '/perfil', label: 'Perfil', icon: 'user' },
];

function Icon({ k }: { k: IconKey }): ReactNode {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {I[k]}
    </svg>
  );
}

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="tabbar">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={`tab-link ${pathname.startsWith(t.href) ? 'active' : ''}`}>
          <Icon k={t.icon} />
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
