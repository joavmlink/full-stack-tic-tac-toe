import type { ReactNode } from 'react';
import { Link } from 'react-router';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  backTo?: string;
  backLabel?: string;
  aside?: ReactNode;
}

export default function PageHeader({ title, subtitle, backTo = '/', backLabel = 'Menu', aside }: PageHeaderProps) {
  return (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <Link
          to={backTo}
          className="glass grid size-11 shrink-0 place-items-center rounded-xl text-xl transition hover:-translate-x-0.5 hover:bg-white/10"
          aria-label={`Back to ${backLabel}`}
        >
          ←
        </Link>
        <div>
          <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{title}</h1>
          {subtitle && <p className="text-sm text-white/60">{subtitle}</p>}
        </div>
      </div>
      {aside}
    </header>
  );
}
