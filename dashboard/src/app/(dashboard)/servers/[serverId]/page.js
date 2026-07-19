'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Link from 'next/link';
import {
  Server,
  ArrowLeft,
  Plus,
  Trash2,
  Edit2,
  Activity,
  Shield,
  Radio,
  Key,
  Users,
  Check,
  Eye,
  EyeOff,
} from 'lucide-react';

export default function ServerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const serverId = params.serverId;

  const [server, setServer] = useState(null);
  const [socks5Users, setSocks5Users] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('add'); // 'add' or 'edit'
  const [selectedUser, setSelectedUser] = useState(null);

  // Form inputs
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [port, setPort] = useState(1080);
  const [maxConnections, setMaxConnections] = useState(5);
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const fetchServerDetails = async () => {
    try {
      const [serverRes, socksRes] = await Promise.all([
        apiFetch(`/servers/${serverId}`),
        apiFetch(`/servers/${serverId}/socks5-users`),
      ]);

      setServer(serverRes.data);
      setSocks5Users(socksRes.data || []);
    } catch (err) {
      console.error('Failed to load server details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServerDetails();
  }, [serverId]);

  const handleOpenAddModal = () => {
    setModalMode('add');
    setSelectedUser(null);
    setUsername('');
    setPassword('');
    setPort(1080 + socks5Users.length);
    setMaxConnections(5);
    setFormError('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (u) => {
    setModalMode('edit');
    setSelectedUser(u);
    setUsername(u.username);
    setPassword('');
    setPort(u.port);
    setMaxConnections(u.max_connections);
    setFormError('');
    setIsModalOpen(true);
  };

  const handleSubmitUser = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormLoading(true);

    try {
      if (modalMode === 'add') {
        await apiFetch(`/servers/${serverId}/socks5-users`, {
          method: 'POST',
          body: JSON.stringify({
            username,
            password,
            port: Number(port),
            max_connections: Number(maxConnections),
          }),
        });
      } else {
        await apiFetch(`/servers/${serverId}/socks5-users/${selectedUser.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            password: password || undefined,
            port: Number(port),
            max_connections: Number(maxConnections),
          }),
        });
      }

      setIsModalOpen(false);
      fetchServerDetails();
    } catch (err) {
      setFormError(err.message || 'Operation failed');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteUser = async (socks5UserId) => {
    if (!confirm('Are you sure you want to delete these SOCKS5 credentials?')) return;

    try {
      await apiFetch(`/servers/${serverId}/socks5-users/${socks5UserId}`, {
        method: 'DELETE',
      });
      fetchServerDetails();
    } catch (err) {
      alert(err.message || 'Failed to delete user');
    }
  };

  if (loading) {
    return (
      <div className="py-20 flex justify-center">
        <div className="w-8 h-8 border-4 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!server) {
    return (
      <div className="space-y-4">
        <Link href="/servers">
          <Button variant="ghost" size="sm">
            <ArrowLeft size={16} /> Back to Servers
          </Button>
        </Link>
        <Card className="py-12 text-center text-[var(--text-muted)]">Server not found</Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/servers">
            <Button variant="secondary" size="sm">
              <ArrowLeft size={16} />
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] flex items-center justify-center text-[var(--accent-secondary)]">
              <Server size={24} />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">{server.hostname}</h1>
                <Badge status={server.status}>{server.status}</Badge>
              </div>
              <p className="text-xs text-[var(--text-muted)] font-mono">{server.ip_address} • OS: {server.os_type || 'Linux'}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link href={`/servers/${serverId}/metrics`}>
            <Button variant="secondary" size="md">
              <Activity size={16} /> Metrics & Charts
            </Button>
          </Link>
          <Button variant="primary" size="md" onClick={handleOpenAddModal}>
            <Plus size={16} /> Add SOCKS5 Credentials
          </Button>
        </div>
      </div>

      {/* SOCKS5 Users Credentials Table */}
      <Card className="space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-4">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-[var(--accent-secondary)]" />
            <h3 className="font-semibold text-base text-[var(--text-primary)]">Configured SOCKS5 Users ({socks5Users.length})</h3>
          </div>
        </div>

        {socks5Users.length === 0 ? (
          <div className="py-12 text-center text-[var(--text-muted)] text-sm space-y-3">
            <p>No SOCKS5 users configured on this server yet.</p>
            <Button variant="primary" size="sm" onClick={handleOpenAddModal}>
              <Plus size={14} /> Add First SOCKS5 User
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-xs uppercase text-[var(--text-muted)] font-semibold">
                  <th className="py-3 px-4">Username</th>
                  <th className="py-3 px-4">Proxy Port</th>
                  <th className="py-3 px-4">Max Conns</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {socks5Users.map((u) => (
                  <tr key={u.id} className="hover:bg-[rgba(255,255,255,0.02)] transition-colors">
                    <td className="py-3.5 px-4 font-mono font-medium text-[var(--text-primary)]">{u.username}</td>
                    <td className="py-3.5 px-4 font-mono text-[var(--accent-secondary)]">{u.port}</td>
                    <td className="py-3.5 px-4">{u.max_connections} concurrent</td>
                    <td className="py-3.5 px-4">
                      <Badge status={u.is_active ? 'online' : 'offline'}>
                        {u.is_active ? 'Active' : 'Disabled'}
                      </Badge>
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-2">
                      <Button variant="ghost" size="sm" onClick={() => handleOpenEditModal(u)}>
                        <Edit2 size={14} /> Edit
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => handleDeleteUser(u.id)}>
                        <Trash2 size={14} /> Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Add / Edit SOCKS5 User Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={modalMode === 'add' ? 'Add SOCKS5 User Credentials' : 'Edit SOCKS5 User Credentials'}
      >
        <form onSubmit={handleSubmitUser} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
              {formError}
            </div>
          )}

          <Input
            label="SOCKS5 Username"
            type="text"
            placeholder="proxy_user"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={modalMode === 'edit'}
            required
          />

          <div className="relative">
            <Input
              label={modalMode === 'edit' ? 'New Password (leave blank to keep current)' : 'Password'}
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required={modalMode === 'add'}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-8 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Proxy Port"
              type="number"
              min={1024}
              max={65535}
              value={port}
              onChange={(e) => setPort(e.target.value)}
              required
            />
            <Input
              label="Max Concurrent Connections"
              type="number"
              min={1}
              max={1000}
              value={maxConnections}
              onChange={(e) => setMaxConnections(e.target.value)}
              required
            />
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-[var(--border-subtle)]">
            <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={formLoading}>
              {modalMode === 'add' ? 'Create User' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
