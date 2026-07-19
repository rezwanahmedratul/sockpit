'use client';

import clsx from 'clsx';

export default function Badge({ children, status = 'default', className }) {
  const styles = {
    online: 'bg-[rgba(0,206,201,0.12)] text-[var(--status-online)] border-[rgba(0,206,201,0.3)]',
    offline: 'bg-[rgba(99,110,114,0.15)] text-[var(--status-offline)] border-[rgba(99,110,114,0.3)]',
    error: 'bg-[rgba(255,107,107,0.15)] text-[var(--status-error)] border-[rgba(255,107,107,0.3)]',
    warning: 'bg-[rgba(254,202,87,0.15)] text-[var(--status-warning)] border-[rgba(254,202,87,0.3)]',
    admin: 'bg-[rgba(108,92,231,0.15)] text-[var(--accent-secondary)] border-[rgba(108,92,231,0.3)]',
    default: 'bg-[rgba(255,255,255,0.06)] text-[var(--text-secondary)] border-[var(--border-subtle)]',
  };

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border tracking-wide uppercase',
        styles[status] || styles.default,
        className
      )}
    >
      {status === 'online' && <span className="w-1.5 h-1.5 rounded-full bg-[var(--status-online)] animate-pulse" />}
      {status === 'offline' && <span className="w-1.5 h-1.5 rounded-full bg-[var(--status-offline)]" />}
      {status === 'error' && <span className="w-1.5 h-1.5 rounded-full bg-[var(--status-error)]" />}
      {children}
    </span>
  );
}
