import { createServer } from 'http';
import { env } from './config/env';
import { logger } from './util/logger';
import { RoomStore } from './game/store';
import { initialGameState } from './game/state';
import { SnapshotStore } from './persistence/snapshot';
import { buildApp } from './app';
import { createIo } from './socket';
import { TitleImageStore } from './media/titleImage';

async function main(): Promise<void> {
  const store = new RoomStore('made-up-or-not', initialGameState());

  // Restore prior game state (crash recovery) if a snapshot store is configured.
  const snapshots = new SnapshotStore();
  const restored = await snapshots.load();
  if (restored) store.restore(restored);

  // Title artwork lives beside the snapshot. If its bytes did not come back
  // (no Redis), drop the reference so screens fall back to the text title.
  const titleImages = new TitleImageStore(snapshots);
  await titleImages.load();
  const ref = store.getState().titleImage;
  if (ref && titleImages.currentId() !== ref.id) store.applyPatch({ titleImage: null });

  const getBackup = () => snapshots.status();
  const app = buildApp(() => store.version, getBackup, titleImages);
  const httpServer = createServer(app);
  const { broadcaster } = createIo(httpServer, store, getBackup, titleImages);

  // Save, then let the operator panel see the backup status move.
  const snapTimer = setInterval(() => {
    const before = JSON.stringify(snapshots.status());
    void snapshots.save(store.snapshot()).then(() => {
      if (JSON.stringify(snapshots.status()) !== before) broadcaster.markStaffDirty();
    });
  }, env.SNAPSHOT_INTERVAL_MS);
  snapTimer.unref?.();

  httpServer.listen(env.PORT, '0.0.0.0', () => {
    logger.info(
      {
        port: env.PORT,
        env: env.NODE_ENV,
        snapshots: snapshots.enabled ? 'redis' : 'disabled',
        displayKey: env.DISPLAY_KEY ? 'required' : 'open',
        origins: env.ALLOWED_ORIGINS,
      },
      'made-up-or-not-server listening',
    );
  });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');
    clearInterval(snapTimer);
    broadcaster.stop();
    await snapshots.save(store.snapshot());
    await snapshots.close();
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref?.();
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((e) => {
  logger.error({ err: e instanceof Error ? e.stack : e }, 'fatal boot error');
  process.exit(1);
});
