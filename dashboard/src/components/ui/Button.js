'use client';

import clsx from 'clsx';

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  className,
  disabled,
  ...props
}) {
  const baseStyles = 'inline-flex items-center justify-center font-medium rounded-lg transition-all cursor-pointer border outline-none disabled:opacity-50 disabled:cursor-not-allowed';

  const variants = {
    primary: 'bg-gradient-to-r from-[#6c5ce7] to-[#8075e5] text-white border-transparent hover:shadow-[0_0_20px_rgba(108,92,231,0.5)] hover:from-[#5b4cc4] hover:to-[#6c5ce7]',
    secondary: 'bg-[rgba(255,255,255,0.06)] text-[var(--text-primary)] border-[var(--border-default)] hover:bg-[rgba(255,255,255,0.12)] hover:border-[var(--accent-primary)]',
    ghost: 'bg-transparent text-[var(--text-secondary)] border-transparent hover:text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.06)]',
    danger: 'bg-gradient-to-r from-[#ff6b6b] to-[#ee5253] text-white border-transparent hover:shadow-[0_0_20px_rgba(255,107,107,0.4)]',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-xs gap-1.5',
    md: 'px-4 py-2 text-sm gap-2',
    lg: 'px-6 py-3 text-base gap-2.5',
  };

  return (
    <button
      className={clsx(baseStyles, variants[variant], sizes[size], className)}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <>
          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
          Loading...
        </>
      ) : (
        children
      )}
    </button>
  );
}
