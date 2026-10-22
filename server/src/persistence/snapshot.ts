import { gzipSync, gunzipSync } from 'zlib';
import Redis from 'ioredis';
import { env } from '../config/env';
import { logger } from '../util/logger';
import type { Snapshot } from '../game/store';

const KEY = 'made-up-or-not:snapshot';

/** What the operator panel and /healthz show, so a dead backup is visible before the show. */
export interface SnapshotStatus {
  mode: 'redis' | 'disabled';
  connected: boolean;
  /** Version restored at boot, or null when the server started fresh. */
  restoredVersion: number | null;
  lastSavedAt: number | null;
  lastError: string | null;
}

/**
 * Crash-recovery snapshot store. When REDIS_URL is set, the full game state is
 * periodically saved to Redis and restored on boot, so a redeploy or restart
 * mid-show does not lose the setup, scores and votes. Without REDIS_URL it
 * degrades to a no-op (in-memory only).
 */
export class SnapshotStore {
  private redis: Redis | null = null;
  /** The version last written, so an unchanged state is not rewritten. */
  private lastVersion = -1;
  private restoredVersion: number | null = null;
  private lastSavedAt: number | null = null;
  private lastError: string | null = null;

  constructor() {
    if (env.REDIS_URL) {
      this.redis = new Redis(env.REDIS_URL, {
        // Railway's private network (redis.railway.internal) can resolve to IPv6
        // only; ioredis looks up IPv4 alone by default and then never connects.
        // 0 = try both.
        family: 0,
        lazyConnect: false,
        maxRetriesPerRequest: 2,
        connectTimeout: 10_000,
      });
      this.redis.on('error', (e) => {
        this.lastError = e.message;
        logger.warn({ err: e.message }, 'Redis error');
      });
      this.redis.on('ready', () => {
        this.lastError = null;
        logger.info('Redis connected');
      });
      logger.info({ host: safeHost(env.REDIS_URL) }, 'Snapshot store: Redis');
    } else {
      logger.warn('Snapshot store: disabled (no REDIS_URL) — state is in-memory only.');
    }
  }

  get enabled(): boolean {
    return this.redis !== null;
  }

  status(): SnapshotStatus {
    return {
      mode: this.redis ? 'redis' : 'disabled',
      connected: this.redis?.status === 'ready',
      restoredVersion: this.restoredVersion,
      lastSavedAt: this.lastSavedAt,
      lastError: this.lastError,
    };
  }

  async save(snap: Snapshot): Promise<void> {
    if (!this.redis) return;
    // The version only moves when state does, so a quiet stretch costs nothing.
    if (snap.version === this.lastVersion) return;
    try {
      // Game state is JSON text and compresses by a factor of thirty or so.
      await this.redis.set(KEY, gzipSync(Buffer.from(JSON.stringify(snap))));
      this.lastVersion = snap.version;
      this.lastSavedAt = Date.now();
      this.lastError = null;
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      logger.warn({ err: this.lastError }, 'Snapshot save failed');
    }
  }

  async load(): Promise<Snapshot | null> {
    if (!this.redis) return null;
    try {
      // Read only once connected: a read that fails on a slow first connection
      // would look like "no snapshot", and the next save would then overwrite
      // the real one with a blank show.
      await this.waitReady(15_000);
      const raw = await this.redis.getBuffer(KEY);
      if (!raw) {
        logger.info('No snapshot in Redis — starting fresh');
        return null;
      }
      const gzipped = raw.length > 1 && raw[0] === 0x1f && raw[1] === 0x8b;
      const snap = JSON.parse(
        gzipped ? gunzipSync(raw).toString('utf8') : raw.toString('utf8'),
      ) as Snapshot;
      this.lastVersion = snap.version;
      this.restoredVersion = snap.version;
      logger.info({ version: snap.version }, 'Restored snapshot from Redis');
      return snap;
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      logger.error({ err: this.lastError }, 'Snapshot load failed — starting fresh');
      return null;
    }
  }

  private waitReady(ms: number): Promise<void> {
    const redis = this.redis!;
    if (redis.status === 'ready') return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        redis.off('ready', onReady);
        reject(new Error(`Redis not reachable after ${ms / 1000}s`));
      }, ms);
      const onReady = () => {
        clearTimeout(timer);
        resolve();
      };
      redis.once('ready', onReady);
    });
  }

  /** Store a binary asset (e.g. the title image) beside the snapshot. No-op without Redis. */
  async saveBlob(key: string, value: Buffer | null): Promise<void> {
    if (!this.redis) return;
    try {
      if (value) await this.redis.set(key, value);
      else await this.redis.del(key);
    } catch (e) {
      logger.warn({ err: e instanceof Error ? e.message : e, key }, 'Blob save failed');
    }
  }

  async loadBlob(key: string): Promise<Buffer | null> {
    if (!this.redis) return null;
    try {
      await this.waitReady(15_000);
      return await this.redis.getBuffer(key);
    } catch (e) {
      logger.warn({ err: e instanceof Error ? e.message : e, key }, 'Blob load failed');
      return null;
    }
  }

  async close(): Promise<void> {
    if (this.redis) await this.redis.quit();
  }
}

/** Host part of a redis URL for the logs, never the password. */
function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'unparseable REDIS_URL';
  }
}
