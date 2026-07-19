'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import { Users, Plus, Shield, UserX, UserCheck } from 'lucide-react';

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState('user');
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  const fetchUsers = async () => {
    try {
      const res = await apiFetch('/users');
      setUsers(res.data || []);
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleOpenAddModal = () => {
    setEmail('');
    setPassword('');
    setDisplayName('');
    setRole('user');
    setFormError('');
    setIsModalOpen(true);
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormLoading(true);

    try {
      await apiFetch('/users', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          display_name: displayName || undefined,
          role,
        }),
      });
      setIsModalOpen(false);
      fetchUsers();
    } catch (err) {
      setFormError(err.message || 'Failed to create user');
    } finally {
      setFormLoading(false);
    }
  };

  const handleToggleActive = async (u) => {
    try {
      await apiFetch(`/users/${u.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          is_active: !u.is_active,
        }),
      });
      fetchUsers();
    } catch (err) {
      alert(err.message || 'Action failed');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="text-[var(--accent-secondary)]" size={24} />
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">User Administration</h1>
        </div>

        <Button variant="primary" size="md" onClick={handleOpenAddModal}>
          <Plus size={16} /> Create User Account
        </Button>
      </div>

      <Card className="space-y-4">
        {loading ? (
          <div className="py-16 flex justify-center">
            <div className="w-8 h-8 border-4 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-xs uppercase text-[var(--text-muted)] font-semibold">
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Email Address</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Servers Owned</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-[rgba(255,255,255,0.02)] transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-[var(--text-primary)]">{u.display_name || 'User'}</td>
                    <td className="py-3.5 px-4 font-mono text-[var(--text-secondary)]">{u.email}</td>
                    <td className="py-3.5 px-4">
                      <Badge status={u.role === 'admin' ? 'admin' : 'default'}>{u.role}</Badge>
                    </td>
                    <td className="py-3.5 px-4">{u.servers_count || 0} servers</td>
                    <td className="py-3.5 px-4">
                      <Badge status={u.is_active ? 'online' : 'offline'}>
                        {u.is_active ? 'Active' : 'Deactivated'}
                      </Badge>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <Button
                        variant={u.is_active ? 'danger' : 'secondary'}
                        size="sm"
                        onClick={() => handleToggleActive(u)}
                      >
                        {u.is_active ? <UserX size={14} /> : <UserCheck size={14} />}
                        {u.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Create User Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Create New Dashboard User">
        <form onSubmit={handleCreateUser} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
              {formError}
            </div>
          )}

          <Input
            label="Email Address"
            type="email"
            placeholder="user@sockpit.local"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <Input
            label="Display Name"
            type="text"
            placeholder="John Doe"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />

          <Input
            label="Password"
            type="password"
            placeholder="••••••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <div className="flex flex-col gap-1.5 w-full">
            <label className="text-xs font-semibold tracking-wide text-[var(--text-secondary)] uppercase">
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="bg-[rgba(18,18,26,0.7)] text-[var(--text-primary)] border border-[var(--border-default)] rounded-lg px-3.5 py-2.5 text-sm outline-none cursor-pointer"
            >
              <option value="user">User (Manages own servers)</option>
              <option value="admin">Administrator (Full platform access)</option>
            </select>
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-[var(--border-subtle)]">
            <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={formLoading}>
              Create User Account
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
