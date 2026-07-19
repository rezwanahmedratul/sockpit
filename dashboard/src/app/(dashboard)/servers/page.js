'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { Search, Server, Shield, Radio, ChevronRight, Terminal } from 'lucide-react';

export default function ServersPage() {
  const [servers, setServers] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const fetchServers = async () => {
    try {
      const res = await apiFetch('/servers');
      setServers(res.data || []);
    } catch (err) {
      console.error('Failed to load servers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServers();
  }, []);

  const filteredServers = servers.filter((srv) => {
    const matchesSearch =
      srv.hostname?.toLowerCase().includes(search.toLowerCase()) ||
      srv.ip_address?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || srv.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Input
            placeholder="Search by hostname or IP..."
            icon={Search}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-80"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-[rgba(18,18,26,0.7)] text-[var(--text-primary)] border border-[var(--border-default)] rounded-lg px-3 py-2.5 text-sm outline-none cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
          </select>
        </div>

        <Link href="/installers">
          <Button variant="primary" size="md">
            <Terminal size={16} /> Deploy New Server
          </Button>
        </Link>
      </div>

      {/* Servers Grid */}
      {loading ? (
        <div className="py-20 flex justify-center">
          <div className="w-8 h-8 border-4 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredServers.length === 0 ? (
        <Card className="py-16 text-center text-[var(--text-muted)] space-y-4">
          <Server size={40} className="mx-auto text-[var(--text-muted)] opacity-50" />
          <div className="space-y-1">
            <h3 className="font-semibold text-base text-[var(--text-primary)]">No servers found</h3>
            <p className="text-xs">
              {search || statusFilter !== 'all'
                ? 'Try adjusting your search query or filter.'
                : 'No server spokes registered yet.'}
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredServers.map((srv) => (
            <Link key={srv.id} href={`/servers/${srv.id}`}>
              <Card interactive className="space-y-4 group">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] flex items-center justify-center text-[var(--accent-secondary)]">
                      <Server size={20} />
                    </div>
                    <div className="flex flex-col">
                      <h3 className="font-bold text-base text-[var(--text-primary)] group-hover:text-[var(--accent-secondary)] transition-colors">
                        {srv.hostname}
                      </h3>
                      <span className="text-xs text-[var(--text-muted)] font-mono">{srv.ip_address}</span>
                    </div>
                  </div>
                  <Badge status={srv.status}>{srv.status}</Badge>
                </div>

                <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs text-[var(--text-secondary)]">
                  <span>OS: {srv.os_type || 'Linux'}</span>
                  <span>{srv.socks5_users_count || 0} Proxy Users</span>
                </div>

                <div className="flex items-center justify-end text-xs font-semibold text-[var(--accent-secondary)] gap-1 pt-1">
                  Manage Server <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
