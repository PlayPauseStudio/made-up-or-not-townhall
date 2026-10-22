import type { RoomStore } from '../game/store';
import { displayView, operatorView } from '../game/redact';
import { SRV } from '../protocol/events';
import type { SnapshotStatus } from '../persistence/snapshot';
import { type AppServer, type AppSocket, ROOM_OPERATOR, ROOM_DISPLAY } from './types';

/**
 * Owns all server→client emission and role-based redaction.
 *
 * Operator actions are infrequent, so each one sends a full per-role projection
 * — small, and no delta-merge bugs to chase in a venue. The only other thing
 * that moves is the Redis backup badge, pushed to the operator on its own.
 */
export class Broadcaster {
  constructor(
    private readonly io: AppServer,
    private readonly store: RoomStore,
    private readonly getBackup: () => SnapshotStatus,
  ) {}

  private view(role: 'operator' | 'display') {
    const state = this.store.getState();
    return role === 'display' ? displayView(state) : operatorView(state, this.getBackup());
  }

  /** Send the appropriate full state to one socket (on join). */
  sendFullTo(socket: AppSocket): void {
    socket.emit(SRV.STATE_FULL, { version: this.store.version, state: this.view(socket.data.role) });
  }

  /** Broadcast the current state to both rooms, projected per role. */
  broadcastAll(): void {
    const version = this.store.version;
    this.io.to(ROOM_OPERATOR).emit(SRV.STATE_FULL, { version, state: this.view('operator') });
    this.io.to(ROOM_DISPLAY).emit(SRV.STATE_FULL, { version, state: this.view('display') });
  }

  /** The backup status moved — only the operator shows it. */
  markStaffDirty(): void {
    this.io.to(ROOM_OPERATOR).emit(SRV.STATE_PATCH, {
      version: this.store.version,
      changed: { backup: this.getBackup() },
    });
  }

  /** Kept for the shutdown path; nothing is throttled any more. */
  stop(): void {}
}
