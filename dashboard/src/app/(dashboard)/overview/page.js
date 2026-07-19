'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { useWebSocket } from '@/hooks/useWebSocket';
import StatCard from '@/components/ui/StatCard';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Link from 'next/link';
import { Server, Activity, Users, Radio, ArrowRight, Clock, Shield } from 'lucide-react';

export default function OverviewPage() {
  const [stats, setStats] = useState({
    totalServers: 0,
    onlineServers: 0,
    totalSocks5Users: 0,
    activeConnections: 0,
  });
  const [servers, setServers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchOverviewData = async () => {
    try {
      const [serversRes, usersRes] = await Promise.all([
        apiFetch('/servers'),
        apiFetch('/users').catch(() => ({ data: [] })),
      ]);

      const serverList = serversRes.data || [];
      const onlineCount = serverList.filter((s) => s.status === 'online').length;

      let totalSocks5 = 0;
      let totalActiveConns = 0;
      serverList.forEach((s) => {
        totalSocks5 += Number(s.socks5_users_count || 0);
        totalActiveConns += Number(s.current_connections || 0);
      });

      setServers(serverList.slice(0, 5));
      setStats({
        totalServers: serverList.length,
        onlineServers: onlineCount,
        totalSocks5Users: totalSocks5,
        activeConnections: totalActiveConns,
      });
    } catch (err) {
      console.error('Failed to load overview stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverviewData();
  }, []);

  // Listen for real-time WebSocket events
  const handleWsEvent = useCallback((event) => {
    if (event.type === 'server_status_changed' || event.type === 'server_registered') {
      fetchOverviewData();
    }
  }, []);

  useWebSocket(handleWsEvent);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-4 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Top Stat Widgets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          title="Total Servers"
          value={stats.totalServers}
          subtitle="Deployments registered"
          icon={Server}
          color="accent"
        />
        <StatCard
          title="Online Spokes"
          value={stats.onlineServers}
          subtitle={`${stats.totalServers - stats.onlineServers} offline`}
          icon={Radio}
          color="online"
        />
        <StatCard
          title="SOCKS5 Credentials"
          value={stats.totalSocks5Users}
          subtitle="Proxy users configured"
          icon={Users}
          color="warning"
        />
        <StatCard
          title="Active Connections"
          value={stats.activeConnections}
          subtitle="Real-time proxy relays"
          icon={Activity}
          color="accent"
        />
      </div>

      {/* Main Grid: Server Overview & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Registered Servers */}
        <Card className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-4">
            <div className="flex items-center gap-2">
              <Server size={18} className="text-[var(--accent-secondary)]" />
              <h3 className="font-semibold text-base text-[var(--text-primary)]">Connected Servers</h3>
            </div>
            <Link href="/servers">
              <Button variant="ghost" size="sm">
                View All <ArrowRight size={14} />
              </Button>
            </Link>
          </div>

          {servers.length === 0 ? (
            <div className="py-12 text-center text-[var(--text-muted)] text-sm space-y-3">
              <p>No servers registered yet.</p>
              <Link href="/installers">
                <Button variant="primary" size="sm">
                  Generate Agent Installer
                </Button>
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-subtle)]">
              {servers.map((srv) => (
                <div key={srv.id} className="py-3.5 flex items-center justify-between hover:bg-[rgba(255,255,255,0.02)] px-2 rounded-lg transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-default)] flex items-center justify-center text-[var(--text-secondary)] font-mono text-xs">
                      {srv.hostname ? srv.hostname.substring(0, 2).toUpperCase() : 'SR'}
                    </div>
                    <div className="flex flex-col">
                      <span className="font-semibold text-sm text-[var(--text-primary)]">{srv.hostname}</span>
                      <span className="text-xs text-[var(--text-muted)] font-mono">{srv.ip_address}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-[var(--text-secondary)]">{srv.socks5_users_count || 0} users</span>
                    <Badge status={srv.status}>{srv.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Quick Action Panel */}
        <Card className="space-y-5 flex flex-col justify-between">
          <div>
            <h3 className="font-semibold text-base text-[var(--text-primary)] mb-2">Deploy New Server Spoke</h3>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-4">
              Deploy a high-performance Rust SOCKS5 agent on Linux (systemd), Windows (Service), or Docker host.
            </p>
            <div className="p-4 rounded-xl bg-[rgba(108,92,231,0.08)] border border-[var(--border-focus)] space-y-2 mb-4">
              <span className="text-xs font-semibold text-[var(--accent-secondary)] uppercase tracking-wide">Included Features</span>
              <ul className="text-xs text-[var(--text-secondary)] space-y-1">
                <li>• Multi-port username/password auth</li>
                <li>• Per-user connection rate limiter</li>
                <li>• Auto-reconnect & config sync</li>
              </ul>
            </div>
          </div>

          <Link href="/installers">
            <Button variant="primary" size="md" className="w-full">
              Get Installation Command
            </Button>
          </Link>
        </Card>
      </div>
    </div>
  );
}
