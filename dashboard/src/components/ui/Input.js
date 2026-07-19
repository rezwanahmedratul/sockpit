'use client';

import clsx from 'clsx';

export default function Input({
  label,
  error,
  icon: Icon,
  className,
  id,
  ...props
}) {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && (
        <label htmlFor={inputId} className="text-xs font-semibold tracking-wide text-[var(--text-secondary)] uppercase">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        {Icon && (
          <div className="absolute left-3 text-[var(--text-muted)] flex items-center pointer-events-none">
            <Icon size={18} />
          </div>
        )}
        <input
          id={inputId}
          className={clsx(
            'w-full bg-[rgba(18,18,26,0.7)] text-[var(--text-primary)] border border-[var(--border-default)] rounded-lg px-3.5 py-2.5 text-sm outline-none transition-all placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-glow)]',
            Icon && 'pl-10',
            error && 'border-[var(--status-error)] focus:ring-red-500/20',
            className
          )}
          {...props}
        />
      </div>
      {error && <span className="text-xs text-[var(--status-error)]">{error}</span>}
    </div>
  );
}
