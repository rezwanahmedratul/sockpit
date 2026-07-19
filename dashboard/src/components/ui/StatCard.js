'use client';

import Card from './Card';

export default function StatCard({ title, value, subtitle, icon: Icon, color = 'accent' }) {
  const iconColors = {
    accent: 'text-[var(--accent-secondary)] bg-[var(--accent-glow)]',
    online: 'text-[var(--status-online)] bg-[var(--status-online-glow)]',
    warning: 'text-[var(--status-warning)] bg-yellow-500/10',
    error: 'text-[var(--status-error)] bg-red-500/10',
  };

  return (
    <Card className="flex items-center justify-between">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-[var(--text-muted)] tracking-wider uppercase">
          {title}
        </span>
        <span className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
          {value}
        </span>
        {subtitle && (
          <span className="text-xs text-[var(--text-secondary)]">
            {subtitle}
          </span>
        )}
      </div>
      {Icon && (
        <div className={`p-3 rounded-xl flex items-center justify-center ${iconColors[color] || iconColors.accent}`}>
          <Icon size={24} />
        </div>
      )}
    </Card>
  );
}
