import Link from 'next/link';
import { Compass, FolderKanban, LayoutDashboard, Wind } from 'lucide-react';

/**
 * Branded 404 (overhaul-v3 Phase 5.1). Dead ends get exits: the three
 * places a lost user most likely wants to go.
 */

const suggestions = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, blurb: 'Overview & recent work' },
  { href: '/projects', label: 'Projects', icon: FolderKanban, blurb: 'All estimation projects' },
  { href: '/simulation', label: 'Simulation', icon: Wind, blurb: 'CFD workspace' },
];

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-6">
      <div className="w-full max-w-lg text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-lg border border-border/70 bg-card/80 text-muted-foreground shadow-sm">
          <Compass className="h-8 w-8" aria-hidden="true" />
        </div>
        <p className="mb-1 font-mono text-sm font-semibold tracking-widest text-accent">
          404
        </p>
        <h1 className="mb-2 text-2xl font-bold text-foreground">
          This page doesn&apos;t exist
        </h1>
        <p className="mx-auto mb-8 max-w-sm text-sm font-medium leading-relaxed text-muted-foreground">
          The link may be outdated, or the page may have moved during a recent
          update. Here&apos;s where you probably want to be:
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {suggestions.map(({ href, label, icon: Icon, blurb }) => (
            <Link
              key={href}
              href={href}
              className="group rounded-lg border border-border/70 bg-card/80 p-4 text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-[0_10px_22px_color-mix(in_oklab,var(--accent)_16%,transparent)]"
            >
              <Icon className="mb-2 h-5 w-5 text-accent" aria-hidden="true" />
              <p className="text-sm font-semibold text-foreground group-hover:text-accent">
                {label}
              </p>
              <p className="text-xs font-medium text-muted-foreground">{blurb}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
