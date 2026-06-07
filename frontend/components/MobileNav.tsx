'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/', label: 'Terminal' },
  { href: '/market', label: 'Market' },
  { href: '/indexes', label: 'Indexes' },
  { href: '/profile', label: 'Dashboard' },
  { href: '/charts', label: 'Charts' },
] as const;

export default function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      className="md:hidden shrink-0 z-30 border-t border-border/80 bg-[#050805]/95 backdrop-blur-sm"
      aria-label="Main navigation"
    >
      <div className="flex items-stretch justify-around px-1 py-1.5">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 min-w-0 px-1 py-1.5 text-center rounded-sm text-[10px] font-mono uppercase tracking-wide transition-colors ${
                active
                  ? 'text-accent-green bg-accent-green/10'
                  : 'text-text-secondary hover:text-white hover:bg-white/5'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
