'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { ShieldAlert, Clock, User, Activity } from 'lucide-react';

export default function AuditLogPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    try {
      const res = await apiFetch('/audit-logs').catch(() => ({ data: [] }));
      setLogs(res.data || []);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ShieldAlert className="text-[var(--accent-secondary)]" size={24} />
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">Security Audit Log</h1>
      </div>

      <Card className="space-y-4">
        {loading ? (
          <div className="py-16 flex justify-center">
            <div className="w-8 h-8 border-4 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="py-12 text-center text-[var(--text-muted)] text-sm space-y-2">
            <ShieldAlert size={32} className="mx-auto opacity-40" />
            <p>No security audit entries recorded yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-xs uppercase text-[var(--text-muted)] font-semibold">
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Resource</th>
                  <th className="py-3 px-4">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-[rgba(255,255,255,0.02)] transition-colors">
                    <td className="py-3.5 px-4 text-xs font-mono text-[var(--text-muted)]">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4">
                      <Badge status="admin">{log.action}</Badge>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs">{log.resource_type}</td>
                    <td className="py-3.5 px-4 font-mono text-xs text-[var(--text-secondary)]">
                      {JSON.stringify(log.details)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
