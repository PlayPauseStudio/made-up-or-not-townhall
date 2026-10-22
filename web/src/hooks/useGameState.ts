'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { game } from '@/lib/gameState';
import type { Role, TokenProvider } from '@/lib/realtime';

/**
 * Connect this page as `role` and re-render on every server update. `T` is the
 * projection that role receives (OperatorState or DisplayState).
 */
export function useGameState<T>(
  role: Role,
  getToken?: TokenProvider,
  identity?: string,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return;
    game.connect(role, getToken, identity);
    // Deliberately NOT disconnecting on unmount: StrictMode mounts effects
    // twice in dev, and tearing the socket down between them causes a
    // reconnect storm. The manager is idempotent and lives for the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, identity, enabled]);

  const state = useSyncExternalStore(
    (cb) => game.subscribe(cb),
    () => game.getState(),
    () => null,
  );
  const connected = useSyncExternalStore(
    (cb) => game.subscribe(cb),
    () => game.isConnected(),
    () => false,
  );
  const authError = useSyncExternalStore(
    (cb) => game.subscribe(cb),
    () => game.getAuthError(),
    () => null,
  );

  return { state: state as T | null, connected, authError };
}
