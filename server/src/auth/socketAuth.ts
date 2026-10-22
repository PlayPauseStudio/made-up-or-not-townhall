import type { Socket } from 'socket.io';
import type { ExtendedError } from 'socket.io/dist/namespace';
import { verifyOperatorToken } from './operatorJwt';
import { env } from '../config/env';
import { logger } from '../util/logger';

export type Role = 'operator' | 'display';

export interface SocketData {
  role: Role;
}

/**
 * Socket.IO handshake auth middleware. Runs once per connection, before any
 * event handler, and stamps the trusted role onto socket.data. Rejected
 * connections never reach a handler.
 *
 * Client connects with: io(url, { auth: { role, token } }).
 */
export async function socketAuthMiddleware(
  socket: Socket,
  next: (err?: ExtendedError) => void,
): Promise<void> {
  try {
    const auth = (socket.handshake.auth ?? {}) as { role?: string; token?: string };
    const role = auth.role;

    if (role === 'display') {
      // Unkeyed by default; when DISPLAY_KEY is configured the big screen must
      // present it too (see config/env.ts).
      if (env.DISPLAY_KEY && auth.token !== env.DISPLAY_KEY) {
        return next(new Error('display_key_invalid'));
      }
      socket.data = { role: 'display' } satisfies SocketData;
      return next();
    }

    if (role === 'operator') {
      if (!auth.token) return next(new Error('operator_token_required'));
      await verifyOperatorToken(auth.token);
      socket.data = { role: 'operator' } satisfies SocketData;
      return next();
    }

    return next(new Error('invalid_role'));
  } catch (e) {
    logger.warn({ err: e instanceof Error ? e.message : e }, 'Socket auth rejected');
    return next(new Error('unauthorized'));
  }
}
