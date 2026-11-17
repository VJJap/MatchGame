import { io, type Socket } from 'socket.io-client';
import type { CharClientToServer, CharServerToClient } from '../../../shared/character';

export type CharSocket = Socket<CharServerToClient, CharClientToServer>;

const serverUrl = (import.meta.env.VITE_SERVER_URL as string | undefined)?.trim();

/** MatchCharacter talks on its own Socket.IO namespace. Connected lazily by activateCharacter(). */
export const charSocket: CharSocket = io(`${serverUrl ?? ''}/character`, {
  reconnectionDelayMax: 3000,
  autoConnect: false,
});

// Holds a live socket / module state: in dev, reload the page instead of hot-swapping (the session restores the seat).
if (import.meta.hot) import.meta.hot.accept(() => window.location.reload());
