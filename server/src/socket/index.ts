import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { env } from '../config/env';
import { logger } from '../util/logger';
import { socketAuthMiddleware } from '../auth/socketAuth';
import type { RoomStore } from '../game/store';
import type { SnapshotStatus } from '../persistence/snapshot';
import type { TitleImageStore } from '../media/titleImage';
import { Broadcaster } from './broadcast';
import { registerOperatorHandlers } from './handlers/operator';
import { type AppServer, type AppSocket, ROOM_OPERATOR, ROOM_DISPLAY } from './types';

export interface RealtimeServer {
  io: AppServer;
  broadcaster: Broadcaster;
}

const ROOM_FOR = {
  operator: ROOM_OPERATOR,
  display: ROOM_DISPLAY,
} as const;

export function createIo(
  httpServer: HttpServer,
  store: RoomStore,
  getBackup: () => SnapshotStatus,
  titleImages: TitleImageStore,
): RealtimeServer {
  const io: AppServer = new Server(httpServer, {
    cors: { origin: env.ALLOWED_ORIGINS, credentials: true },
    pingInterval: 20_000,
    pingTimeout: 20_000,
    // Room for one title PNG (5 MB) as base64, which grows it by a third.
    maxHttpBufferSize: 9_000_000,
    perMessageDeflate: { threshold: 1024 },
    httpCompression: { threshold: 1024 },
  });

  const broadcaster = new Broadcaster(io, store, getBackup);

  io.use(socketAuthMiddleware);

  io.on('connection', (socket: AppSocket) => {
    const { role } = socket.data;
    logger.info({ role, id: socket.id }, 'socket connected');
    socket.join(ROOM_FOR[role]);

    registerOperatorHandlers(socket, { store, broadcaster, titleImages });
    broadcaster.sendFullTo(socket);

    socket.on('disconnect', (reason) => {
      logger.debug({ role, id: socket.id, reason }, 'socket disconnected');
    });
  });

  return { io, broadcaster };
}
