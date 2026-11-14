'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { NAV_ITEMS, isNavActive } from '@/lib/navigation';

export default function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      className="md:hidden shrink-0 z-30 border-t border-border/80 bg-background/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
      aria-label="Main navigation"
    >
      <div className="flex items-stretch justify-around px-1 py-1">
        {NAV_ITEMS.map((item) => {
          const active = isNavActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-md px-1 py-1.5 text-center font-sans text-[10px] font-medium transition-colors ${
                active ? 'text-accent-green' : 'text-text-secondary hover:text-white'
              }`}
            >
              <Icon name={item.icon} size={18} strokeWidth={active ? 2 : 1.75} />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
