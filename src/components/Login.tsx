import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Lock, Unlock, Terminal } from 'lucide-react';

interface LoginProps {
  onLoginSuccess: (apiKey: string) => void;
}

export function Login({ onLoginSuccess }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // 1. Authenticate with Firebase
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 2. Fetch the NVIDIA API key from Firestore
      const secretDoc = await getDoc(doc(db, 'admin', 'secrets'));
      
      if (secretDoc.exists()) {
        const apiKey = secretDoc.data().NVIDIA_API_KEY;
        if (apiKey) {
          onLoginSuccess(apiKey);
        } else {
          setError('API key not found in database.');
        }
      } else {
        setError('Secrets document not found. Make sure you completed Step 7.');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md bg-hacker-panel border border-accent rounded-lg p-8 shadow-2xl relative overflow-hidden">
        {/* Decorative corner accents */}
        <div className="absolute top-0 left-0 w-4 h-4 border-t border-l border-hacker-accent opacity-50"></div>
        <div className="absolute top-0 right-0 w-4 h-4 border-t border-r border-hacker-accent opacity-50"></div>
        <div className="absolute bottom-0 left-0 w-4 h-4 border-b border-l border-hacker-accent opacity-50"></div>
        <div className="absolute bottom-0 right-0 w-4 h-4 border-b border-r border-hacker-accent opacity-50"></div>

        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-full border border-accent flex items-center justify-center mb-4 bg-hacker-bg shadow-[0_0_15px_rgba(51,255,179,0.2)]">
            <Terminal className="text-hacker-accent w-8 h-8" />
          </div>
          <h1 className="text-2xl font-mono text-hacker-text tracking-widest uppercase">
            System <span className="text-hacker-accent">Entity</span>
          </h1>
          <p className="text-hacker-muted text-sm font-code mt-2">Restricted Access // Auth Required</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          {error && (
            <div className="bg-red-900/20 border border-red-500/50 text-red-400 p-3 rounded font-mono text-sm text-center">
              {error}
            </div>
          )}
          
          <div className="space-y-2">
            <label className="block text-hacker-muted text-xs font-mono uppercase tracking-wider">
              Identifier (Email)
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-hacker-bg border border-accent/50 rounded p-3 text-hacker-text font-mono focus:glow-focus transition-all placeholder:text-hacker-muted/30"
              placeholder="user@network.local"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="block text-hacker-muted text-xs font-mono uppercase tracking-wider">
              Passphrase
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-hacker-bg border border-accent/50 rounded p-3 text-hacker-text font-mono focus:glow-focus transition-all placeholder:text-hacker-muted/30"
              placeholder="••••••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-hacker-accent/10 hover:bg-hacker-accent/20 border border-hacker-accent text-hacker-accent font-mono uppercase tracking-widest p-3 rounded transition-all flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="animate-pulse">Authenticating...</span>
            ) : (
              <>
                <Unlock className="w-4 h-4 group-hover:scale-110 transition-transform" />
                <span>Initialize</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
