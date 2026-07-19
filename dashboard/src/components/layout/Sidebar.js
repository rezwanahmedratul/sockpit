'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import {
  LayoutDashboard,
  Server,
  Terminal,
  Users,
  ShieldAlert,
  Settings,
  LogOut,
  Radio,
} from 'lucide-react';
import clsx from 'clsx';

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const navItems = [
    { label: 'Overview', href: '/overview', icon: LayoutDashboard },
    { label: 'Servers', href: '/servers', icon: Server },
    { label: 'Installers', href: '/installers', icon: Terminal },
    ...(user?.role === 'admin'
      ? [
          { label: 'User Management', href: '/users', icon: Users },
          { label: 'Audit Logs', href: '/audit-log', icon: ShieldAlert },
        ]
      : []),
    { label: 'Settings', href: '/settings', icon: Settings },
  ];

  return (
    <aside className="w-64 bg-[var(--bg-secondary)] border-r border-[var(--border-subtle)] flex flex-col h-screen sticky top-0 z-30 select-none">
      {/* Brand Header */}
      <div className="p-6 flex items-center gap-3 border-b border-[var(--border-subtle)]">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#6c5ce7] to-[#a29bfe] flex items-center justify-center text-white shadow-lg shadow-[#6c5ce7]/30">
          <Radio size={20} className="animate-pulse" />
        </div>
        <div>
          <h1 className="font-bold text-lg tracking-tight text-[var(--text-primary)]">SockPit</h1>
          <p className="text-[10px] uppercase font-semibold text-[var(--text-muted)] tracking-wider">SOCKS5 Proxy SaaS</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');

          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                'flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all group',
                isActive
                  ? 'bg-gradient-to-r from-[#6c5ce7]/20 to-transparent text-[var(--text-primary)] border-l-2 border-[var(--accent-primary)] shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.04)]'
              )}
            >
              <Icon
                size={18}
                className={clsx(
                  'transition-transform group-hover:scale-110',
                  isActive ? 'text-[var(--accent-secondary)]' : 'text-[var(--text-muted)]'
                )}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User Footer */}
      <div className="p-4 border-t border-[var(--border-subtle)] bg-[rgba(0,0,0,0.2)] flex items-center justify-between">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-8 h-8 rounded-full bg-[var(--bg-elevated)] border border-[var(--border-default)] flex items-center justify-center font-bold text-xs text-[var(--accent-secondary)]">
            {user?.displayName ? user.displayName.charAt(0).toUpperCase() : 'U'}
          </div>
          <div className="flex flex-col truncate">
            <span className="text-xs font-semibold text-[var(--text-primary)] truncate">{user?.displayName || 'User'}</span>
            <span className="text-[10px] text-[var(--text-muted)] truncate">{user?.email}</span>
          </div>
        </div>
        <button
          onClick={logout}
          title="Logout"
          className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--status-error)] hover:bg-red-500/10 transition-all cursor-pointer"
        >
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
}
