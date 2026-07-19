'use client';

import clsx from 'clsx';

export default function Card({ children, className, interactive = false, ...props }) {
  return (
    <div
      className={clsx(
        interactive ? 'glass-panel-interactive' : 'glass-panel',
        'p-5 relative overflow-hidden',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
