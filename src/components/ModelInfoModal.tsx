import { useEffect, useState } from 'react';
import { X, Server, Activity, Database, KeyRound } from 'lucide-react';
import { MODELS } from '../services/ai';

interface ModelInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionMessages: number;
}

export function ModelInfoModal({ isOpen, onClose, sessionMessages }: ModelInfoModalProps) {
  const [keyCount, setKeyCount] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen && keyCount === null) {
      fetch('/api/stats')
        .then(res => res.json())
        .then(data => setKeyCount(data.keyCount))
        .catch(() => setKeyCount(1)); // Default fallback
    }
  }, [isOpen, keyCount]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-hacker-panel border border-hacker-accent rounded w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[90dvh]">
        <div className="p-4 border-b border-hacker-accent/30 flex justify-between items-center bg-hacker-bg shrink-0">
          <h2 className="text-hacker-accent font-mono text-lg flex items-center gap-2">
            <Server size={20} />
            System Subroutines (Models)
          </h2>
          <button onClick={onClose} className="text-hacker-muted hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-4 space-y-4 font-sans text-hacker-text overflow-y-auto">
          <div className="bg-black/40 p-3 rounded border border-hacker-accent/20">
            <h3 className="font-mono text-hacker-accent text-sm mb-2 flex items-center gap-2">
              <Activity size={16} />
              Session Quota Estimation
            </h3>
            <p className="text-sm text-hacker-muted mb-2">
              NVIDIA free-tier limits are opaque, but this instance is currently backed by a key rotation engine.
            </p>
            <div className="grid grid-cols-2 gap-2 mt-4">
              <div className="bg-hacker-bg p-2 rounded text-center border border-hacker-accent/10">
                <div className="text-2xl font-mono text-white">{sessionMessages}</div>
                <div className="text-xs text-hacker-muted">Queries Sent (Session)</div>
              </div>
              <div className="bg-hacker-bg p-2 rounded text-center border border-hacker-accent/10">
                <div className="text-2xl font-mono text-hacker-accent flex items-center justify-center gap-1">
                  <KeyRound size={20} />
                  {keyCount !== null ? keyCount : '...'}
                </div>
                <div className="text-xs text-hacker-muted">Active API Keys</div>
              </div>
            </div>
            <p className="text-xs text-hacker-muted mt-3 italic text-center">
              Recharge Time: Typically 24 hours per key limit. If one key is exhausted, the system automatically hot-swaps to the next.
            </p>
          </div>

          <div>
            <h3 className="font-mono text-hacker-accent text-sm mb-2 flex items-center gap-2">
              <Database size={16} />
              Active Specialists roster
            </h3>
            <div className="space-y-1">
              {Object.entries(MODELS).map(([category, model]) => (
                <div key={category} className="flex justify-between items-center bg-hacker-bg p-2 rounded border border-hacker-accent/10">
                  <span className="text-xs font-mono uppercase text-hacker-muted">{category}</span>
                  <span className="text-xs text-white truncate max-w-[200px]" title={model}>{model}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
