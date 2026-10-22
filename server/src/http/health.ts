import { Router } from 'express';
import type { SnapshotStatus } from '../persistence/snapshot';

/** Liveness endpoint for Railway health checks, plus whether the Redis backup is alive. */
export function healthRouter(getVersion: () => number, getBackup: () => SnapshotStatus): Router {
  const router = Router();
  router.get('/healthz', (_req, res) => {
    const b = getBackup();
    res.json({
      ok: true,
      version: getVersion(),
      uptime: process.uptime(),
      backup: { mode: b.mode, connected: b.connected, restored: b.restoredVersion !== null },
    });
  });
  return router;
}
