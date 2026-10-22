import type { Server, Socket, DefaultEventsMap } from 'socket.io';
import type { SocketData } from '../auth/socketAuth';

// Payloads are validated with zod at runtime; the meaningful generic here is
// SocketData, which carries the trusted role stamped by the handshake.
export type AppServer = Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>;
export type AppSocket = Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>;

/** The operator drives the show and exports data — full-fidelity state. */
export const ROOM_OPERATOR = 'room:operator';
/** The big screen — board, live question, scores. Never the answer before reveal. */
export const ROOM_DISPLAY = 'room:display';
