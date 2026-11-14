import type { IconName } from '@/components/ui/Icon';

export const NAV_ITEMS: { href: string; label: string; icon: IconName }[] = [
  { href: '/', label: 'Terminal', icon: 'terminal' },
  { href: '/market', label: 'Market', icon: 'chart' },
  { href: '/perps', label: 'Perps', icon: 'bolt' },
  { href: '/indexes', label: 'Indexes', icon: 'pie' },
  { href: '/profile', label: 'Dashboard', icon: 'briefcase' },
  { href: '/charts', label: 'Charts', icon: 'trend' },
];

export const isNavActive = (pathname: string, href: string) =>
  href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
