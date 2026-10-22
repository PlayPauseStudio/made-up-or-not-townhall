import { createHash } from 'crypto';
import { Router } from 'express';
import type { SnapshotStore } from '../persistence/snapshot';
import type { TitleImage } from '../game/state';
import { logger } from '../util/logger';

const KEY = 'made-up-or-not:title-image';
/** Generous for a PNG logo; keeps one upload from swamping the socket. */
export const MAX_TITLE_IMAGE_BYTES = 5 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * The uploaded title artwork.
 *
 * The bytes live here, not in game state: state is re-sent to every screen on
 * every operator click, and an image inside it would be re-sent with it (the
 * Playlist show burned 28 GB of egress that way). State carries only the
 * image's id and size; screens load the PNG once from /title-image/<id>.png,
 * and the id changes with the content, so it can be cached for good.
 */
export class TitleImageStore {
  private current: { id: string; png: Buffer } | null = null;

  constructor(private readonly snapshots: SnapshotStore) {}

  /** Restore the image saved in Redis (if any) at boot. */
  async load(): Promise<void> {
    const png = await this.snapshots.loadBlob(KEY);
    if (png && isPng(png)) {
      this.current = { id: hash(png), png };
      logger.info({ bytes: png.length }, 'Restored title image from Redis');
    }
  }

  /**
   * Accept a `data:image/png;base64,…` upload. Returns the metadata for game
   * state, or an error code.
   */
  put(dataUrl: string): TitleImage | 'bad_image' | 'image_too_large' {
    const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!m) return 'bad_image';
    const png = Buffer.from(m[1], 'base64');
    if (png.length > MAX_TITLE_IMAGE_BYTES) return 'image_too_large';
    if (!isPng(png)) return 'bad_image';
    const id = hash(png);
    this.current = { id, png };
    void this.snapshots.saveBlob(KEY, png);
    return { id, width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
  }

  currentId(): string | null {
    return this.current?.id ?? null;
  }

  clear(): void {
    this.current = null;
    void this.snapshots.saveBlob(KEY, null);
  }

  router(): Router {
    const router = Router();
    router.get('/title-image/:file', (req, res) => {
      const id = req.params.file.replace(/\.png$/, '');
      if (!this.current || this.current.id !== id) return res.status(404).end();
      res.set('Content-Type', 'image/png');
      res.set('Cache-Control', 'public, max-age=31536000, immutable');
      res.set('Cross-Origin-Resource-Policy', 'cross-origin');
      return res.send(this.current.png);
    });
    return router;
  }
}

function isPng(buf: Buffer): boolean {
  // Signature, then the IHDR chunk that carries width/height at bytes 16–23.
  return buf.length > 24 && buf.subarray(0, 8).equals(PNG_SIGNATURE) && buf.toString('ascii', 12, 16) === 'IHDR';
}

function hash(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex').slice(0, 16);
}
