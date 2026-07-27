'use client';

/**
 * Shared simulation workspace chrome (overhaul-v3 §1.1, incremental).
 * A single tab bar across the three simulation views so they read as one
 * workspace instead of three disconnected pages. The full single-page merge of
 * the view bodies remains a larger follow-up; this unifies the navigation now.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Columns3, Box, Cpu, LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

const TABS = [
  { href: '/simulation', label: 'Overview', icon: LayoutGrid, exact: true },
  { href: '/simulation/workspace', label: 'Workspace', icon: Columns3 },
  { href: '/simulation/viewer', label: '3D Viewer', icon: Box },
  { href: '/simulation/engine', label: 'Engine', icon: Cpu },
];

export default function SimulationLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="space-y-5">
      <nav
        aria-label="Simulation views"
        className="panel-glass flex flex-wrap gap-1 rounded-xl border border-border/70 bg-card p-1.5"
      >
        {TABS.map((tab) => {
          const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-accent text-accent-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
              )}
            >
              <Icon size={15} aria-hidden="true" />
              {tab.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
