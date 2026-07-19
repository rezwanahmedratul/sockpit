'use client';

import { useAuth } from '@/hooks/useAuth';
import Badge from '@/components/ui/Badge';

export default function Topbar({ title }) {
  const { user } = useAuth();

  return (
    <header className="h-16 border-b border-[var(--border-subtle)] bg-[rgba(10,10,15,0.8)] backdrop-blur-md sticky top-0 z-20 px-8 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">{title}</h2>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Badge status="online">System Connected</Badge>
          {user?.role === 'admin' && <Badge status="admin">Admin</Badge>}
        </div>
      </div>
    </header>
  );
}
