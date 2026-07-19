'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Terminal, Copy, Check, Shield, Cpu, Container, Play } from 'lucide-react';

export default function InstallersPage() {
  const [platform, setPlatform] = useState('linux');
  const [label, setLabel] = useState('');
  const [generatedData, setGeneratedData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);

  const handleGenerate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setCopied(false);
    setCopiedScript(false);

    try {
      const res = await apiFetch('/installers/script', {
        method: 'POST',
        body: JSON.stringify({
          platform,
          label: label || undefined,
        }),
      });
      setGeneratedData(res.data);
    } catch (err) {
      alert(err.message || 'Failed to generate script');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text, setFlag) => {
    navigator.clipboard.writeText(text);
    setFlag(true);
    setTimeout(() => setFlag(false), 2000);
  };

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Platform Selector Cards */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
          Select Target Spoke Operating System
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { id: 'linux', name: 'Linux Systemd Daemon', icon: Terminal, desc: 'Ubuntu, Debian, RHEL, CentOS' },
            { id: 'windows', name: 'Windows Service Wrapper', icon: Cpu, desc: 'Windows 10/11, Server 2016+' },
            { id: 'docker', name: 'Docker Container', icon: Container, desc: 'Any OS with Docker Engine' },
          ].map((p) => {
            const Icon = p.icon;
            const isSelected = platform === p.id;

            return (
              <div
                key={p.id}
                onClick={() => setPlatform(p.id)}
                className={`glass-panel p-4 cursor-pointer transition-all border flex flex-col justify-between ${
                  isSelected
                    ? 'border-[var(--accent-primary)] bg-[rgba(108,92,231,0.12)] shadow-lg shadow-[#6c5ce7]/20 ring-1 ring-[var(--accent-primary)]'
                    : 'border-[var(--border-default)] hover:border-[rgba(255,255,255,0.2)] hover:bg-[rgba(255,255,255,0.03)]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-lg ${isSelected ? 'bg-[var(--accent-primary)] text-white' : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)]'}`}>
                    <Icon size={20} />
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-[var(--text-primary)]">{p.name}</h4>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">{p.desc}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Generation Form */}
      <Card className="space-y-5">
        <form onSubmit={handleGenerate} className="space-y-4">
          <Input
            label="Installation Label (Optional)"
            placeholder="e.g. Office PCs, AWS Frankfurt Spoke, Home Server"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />

          <Button type="submit" variant="primary" size="lg" className="w-full sm:w-auto" isLoading={loading}>
            <Play size={16} /> Generate {platform.toUpperCase()} Install Command
          </Button>
        </form>
      </Card>

      {/* Output One-liner & Full Script */}
      {generatedData && (
        <div className="space-y-6">
          {/* One-liner Section */}
          <Card className="space-y-3 border-l-4 border-l-[var(--accent-primary)]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[var(--accent-secondary)] uppercase tracking-wider">
                ⚡ One-Liner Terminal Command
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(generatedData.one_liner, setCopied)}
              >
                {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                {copied ? 'Copied Command!' : 'Copy Command'}
              </Button>
            </div>

            <div className="p-3.5 bg-[var(--bg-primary)] rounded-lg border border-[var(--border-default)] font-mono text-xs text-[var(--status-online)] overflow-x-auto select-all">
              {generatedData.one_liner}
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              Paste this command directly into your root terminal / administrator PowerShell to install and start the agent automatically.
            </p>
          </Card>

          {/* Full Rendered Script */}
          <Card className="space-y-3">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                Full Generated Script Code
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => copyToClipboard(generatedData.script, setCopiedScript)}
              >
                {copiedScript ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                {copiedScript ? 'Copied Full Script!' : 'Copy Script Code'}
              </Button>
            </div>

            <pre className="p-4 bg-[var(--bg-primary)] rounded-lg border border-[var(--border-default)] font-mono text-xs text-[var(--text-secondary)] overflow-x-auto max-h-96">
              <code>{generatedData.script}</code>
            </pre>
          </Card>
        </div>
      )}
    </div>
  );
}
