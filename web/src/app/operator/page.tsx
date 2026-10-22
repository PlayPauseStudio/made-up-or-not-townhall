'use client';

import { useCallback, useEffect, useState } from 'react';
import { OperatorAccessProvider, useOperatorAccess } from '@/contexts/OperatorAccessContext';
import { useGameState } from '@/hooks/useGameState';
import { game } from '@/lib/gameState';
import { errorText, type Ack } from '@/lib/realtime';
import type { BackupStatus, OperatorState } from '@/lib/types';
import { ShowTab } from '@/components/operator/ShowTab';
import { QuestionsTab } from '@/components/operator/QuestionsTab';
import { SetupTab } from '@/components/operator/SetupTab';

export default function OperatorPage() {
  return (
    <OperatorAccessProvider>
      <Gate />
    </OperatorAccessProvider>
  );
}

function Gate() {
  const { isAuthenticated, token, logout } = useOperatorAccess();
  if (!isAuthenticated || !token) return <Login />;
  return <Console token={token} onLogout={logout} />;
}

function Login() {
  const { authenticate, notice } = useOperatorAccess();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="stage flex min-h-screen items-center justify-center px-4">
      <form
        className="panel w-full max-w-sm space-y-4 p-6"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          if (!(await authenticate(password))) setError('Wrong password, or the server is unreachable.');
          setBusy(false);
        }}
      >
        <h1 className="text-center font-display text-5xl text-gold">Operator</h1>
        {notice && <p className="rounded-lg bg-gold/10 px-3 py-2 text-sm text-gold">{notice}</p>}
        <input
          type="password"
          autoFocus
          className="input !py-3"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button className="btn btn-gold w-full !py-3" disabled={busy || !password}>
          {busy ? 'Checking…' : 'Enter'}
        </button>
      </form>
    </div>
  );
}

/**
 * Whether the Redis backup is alive. If it is not, a redeploy or restart wipes
 * the board, scores and phones — this is how you find out before the show.
 */
function BackupBadge({ backup }: { backup: BackupStatus | null | undefined }) {
  if (!backup) return null;
  let text: string;
  let tone: string;
  if (backup.mode === 'disabled') {
    text = '⚠ Backup off (no Redis)';
    tone = 'text-red-400';
  } else if (!backup.connected) {
    text = '⚠ Backup: Redis not connected';
    tone = 'text-red-400';
  } else {
    text = backup.lastSavedAt ? '✓ Backed up' : '✓ Backup ready';
    tone = 'text-good';
  }
  const detail = [
    backup.restoredVersion !== null ? 'Show was restored from Redis at startup.' : 'Server started fresh (nothing restored).',
    backup.lastSavedAt
      ? `Last saved ${new Date(backup.lastSavedAt).toLocaleTimeString()}.`
      : 'Not saved yet — saves within 5s of any change.',
    backup.lastError ? `Last error: ${backup.lastError}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return (
    <span className={tone} title={detail}>
      {text}
    </span>
  );
}

type Tab = 'show' | 'questions' | 'setup';
const TABS: { id: Tab; label: string }[] = [
  { id: 'show', label: 'Run show' },
  { id: 'questions', label: 'Questions' },
  { id: 'setup', label: 'Teams & rules' },
];

function Console({ token, onLogout }: { token: string; onLogout: (reason?: string) => void }) {
  const { state, connected, authError } = useGameState<OperatorState>('operator', () => token, token);
  const [tab, setTab] = useState<Tab>('show');
  const [toast, setToast] = useState<string | null>(null);

  // A refused token (expired, or the server's secret changed) goes back to the login form.
  useEffect(() => {
    if (authError) {
      game.disconnect();
      onLogout('Your session expired — sign in again.');
    }
  }, [authError, onLogout]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  const act = useCallback(async (p: Promise<Ack>) => {
    const ack = await p;
    if (!ack.ok) setToast(errorText(ack.error));
    return ack.ok;
  }, []);

  if (!state) {
    return (
      <div className="stage flex min-h-screen items-center justify-center text-muted">
        {connected ? 'Loading…' : 'Connecting to the server…'}
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-[var(--bg)]">
      <header className="flex items-center gap-4 border-b border-white/10 px-5 py-2.5">
        <h1 className="font-display text-3xl text-gold">{state.title}</h1>
        <nav className="flex gap-1">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`btn btn-sm ${tab === t.id ? 'btn-on' : ''}`}>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-xs">
          <a href="/display/" target="_blank" rel="noreferrer" className="text-muted hover:text-white">Open display ↗</a>
          <BackupBadge backup={state.backup} />
          <span className={connected ? 'text-good' : 'text-red-400'}>● {connected ? 'Live' : 'Reconnecting'}</span>
          <button
            className="btn btn-sm"
            onClick={() => {
              game.disconnect();
              onLogout();
            }}
          >
            Log out
          </button>
        </div>
      </header>

      <main className="min-h-0 flex-1 p-5">
        {tab === 'show' && <ShowTab state={state} act={act} />}
        {tab === 'questions' && <QuestionsTab state={state} act={act} />}
        {tab === 'setup' && <SetupTab state={state} act={act} />}
      </main>

      {toast && (
        <div className="pop-in fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-red-400/40 bg-[#2a0f17] px-4 py-2.5 text-sm text-red-200 shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
