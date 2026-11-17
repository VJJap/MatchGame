import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '../../../shared/types';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * VITE_SERVER_URL lets the client be hosted separately from the server.
 * Without it the client talks to its own origin (Vite proxies /socket.io in dev,
 * and the Node server serves the built client in production).
 */
const serverUrl = (import.meta.env.VITE_SERVER_URL as string | undefined)?.trim();

// Connected lazily (activateWord) so the game picker doesn't open sockets it doesn't need.
export const socket: GameSocket = serverUrl
  ? io(serverUrl, { reconnectionDelayMax: 3000, autoConnect: false })
  : io({ reconnectionDelayMax: 3000, autoConnect: false });

export const serverBase = serverUrl ?? '';

// Holds a live socket / module state: in dev, reload the page instead of hot-swapping (the session restores the seat).
if (import.meta.hot) import.meta.hot.accept(() => window.location.reload());
