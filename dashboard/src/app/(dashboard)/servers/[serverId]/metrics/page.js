'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Link from 'next/link';
import { ArrowLeft, Activity, Cpu, HardDrive, Wifi, Users } from 'lucide-react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export default function ServerMetricsPage() {
  const params = useParams();
  const serverId = params.serverId;

  const [metrics, setMetrics] = useState([]);
  const [range, setRange] = useState('24h');
  const [loading, setLoading] = useState(true);

  const fetchMetrics = async () => {
    try {
      const res = await apiFetch(`/servers/${serverId}/metrics?range=${range}`);
      setMetrics(res.data || []);
    } catch (err) {
      console.error('Failed to load server metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, [serverId, range]);

  return (
    <div className="space-y-8">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href={`/servers/${serverId}`}>
            <Button variant="secondary" size="sm">
              <ArrowLeft size={16} /> Back to Server
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <Activity className="text-[var(--accent-secondary)]" size={24} />
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">System Metrics & Analytics</h1>
          </div>
        </div>

        {/* Range Selector */}
        <div className="flex items-center bg-[var(--bg-secondary)] border border-[var(--border-default)] p-1 rounded-lg">
          {['1h', '6h', '24h', '7d'].map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold uppercase transition-all cursor-pointer ${
                range === r
                  ? 'bg-[var(--accent-primary)] text-white shadow-md'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center">
          <div className="w-8 h-8 border-4 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* CPU Chart */}
          <Card className="space-y-4">
            <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] pb-3">
              <Cpu size={18} className="text-[#00cec9]" />
              <h3 className="font-semibold text-sm text-[var(--text-primary)]">CPU Utilization (%)</h3>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={metrics}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="timestamp" stroke="var(--text-muted)" fontSize={10} />
                  <YAxis stroke="var(--text-muted)" fontSize={10} domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-default)', borderRadius: '8px' }}
                  />
                  <Line type="monotone" dataKey="cpu_usage" stroke="#00cec9" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* RAM Chart */}
          <Card className="space-y-4">
            <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] pb-3">
              <HardDrive size={18} className="text-[#a29bfe]" />
              <h3 className="font-semibold text-sm text-[var(--text-primary)]">Memory Utilization (%)</h3>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={metrics}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="timestamp" stroke="var(--text-muted)" fontSize={10} />
                  <YAxis stroke="var(--text-muted)" fontSize={10} domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-default)', borderRadius: '8px' }}
                  />
                  <Line type="monotone" dataKey="memory_usage" stroke="#a29bfe" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Bandwidth Chart */}
          <Card className="space-y-4">
            <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] pb-3">
              <Wifi size={18} className="text-[#feca57]" />
              <h3 className="font-semibold text-sm text-[var(--text-primary)]">Network Traffic Bandwidth (KB/s)</h3>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={metrics}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="timestamp" stroke="var(--text-muted)" fontSize={10} />
                  <YAxis stroke="var(--text-muted)" fontSize={10} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-default)', borderRadius: '8px' }}
                  />
                  <Area type="monotone" dataKey="bandwidth_rx" stroke="#feca57" fill="rgba(254,202,87,0.15)" strokeWidth={2} />
                  <Area type="monotone" dataKey="bandwidth_tx" stroke="#6c5ce7" fill="rgba(108,92,231,0.15)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Connections Chart */}
          <Card className="space-y-4">
            <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] pb-3">
              <Users size={18} className="text-[#ff6b6b]" />
              <h3 className="font-semibold text-sm text-[var(--text-primary)]">Active SOCKS5 Connection Relays</h3>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="timestamp" stroke="var(--text-muted)" fontSize={10} />
                  <YAxis stroke="var(--text-muted)" fontSize={10} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-default)', borderRadius: '8px' }}
                  />
                  <Bar dataKey="active_connections" fill="#ff6b6b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
