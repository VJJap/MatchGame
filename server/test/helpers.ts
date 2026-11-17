import type { AddressInfo } from 'node:net';
import { io as ioc, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, RoomSnapshot, ServerToClientEvents, SessionInfo } from '../../shared/types';
import { createGameServer, type GameServer } from '../src/app';
import type { GameConfig } from '../src/config';

export const FAST: Partial<GameConfig> = {
  msPerTimerSecond: 20, // 15 "seconds" = 300 ms
  countdownMs: 40,
  revealMs: 40,
  matchRevealMs: 40,
  reconnectGraceMs: 400,
};

export async function startServer(game: Partial<GameConfig> = FAST): Promise<{ server: GameServer; url: string }> {
  const server = createGameServer({ game });
  await new Promise<void>((resolve) => server.httpServer.listen(0, '127.0.0.1', resolve));
  const { port } = server.httpServer.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${port}` };
}

type AnyEvent = { name: string; payload: unknown };

export class TestClient {
  socket: Socket<ServerToClientEvents, ClientToServerEvents>;
  events: AnyEvent[] = [];
  snap: RoomSnapshot | null = null;
  session: SessionInfo | null = null;

  constructor(url: string) {
    this.socket = ioc(url, { transports: ['websocket'], forceNew: true, reconnection: false });
    this.socket.onAny((name: string, payload: unknown) => {
      this.events.push({ name, payload });
      if (name === 'room_updated') this.snap = payload as RoomSnapshot;
      if (name === 'room_created' || name === 'room_joined') {
        const p = payload as { session: SessionInfo; snapshot: RoomSnapshot };
        this.session = p.session;
        this.snap = p.snapshot;
      }
    });
  }

  connected(): Promise<void> {
    if (this.socket.connected) return Promise.resolve();
    return new Promise((resolve) => this.socket.once('connect', () => resolve()));
  }

  /** Wait for the NEXT occurrence of an event (register before triggering it). */
  next<T = unknown>(name: keyof ServerToClientEvents, timeoutMs = 2000): Promise<T> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`timeout waiting for ${name}`)), timeoutMs);
      this.socket.once(name as never, ((payload: T) => {
        clearTimeout(t);
        resolve(payload);
      }) as never);
    });
  }

  /** Wait for the next occurrence of an event whose payload satisfies `pred`. */
  nextWhere<T = unknown>(name: keyof ServerToClientEvents, pred: (p: T) => boolean, timeoutMs = 2000): Promise<T> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`timeout waiting for ${name}`)), timeoutMs);
      const handler = (payload: T) => {
        if (!pred(payload)) return;
        clearTimeout(t);
        this.socket.off(name as never, handler as never);
        resolve(payload);
      };
      this.socket.on(name as never, handler as never);
    });
  }

  /** Resolve once the latest snapshot satisfies the predicate. */
  until(pred: (s: RoomSnapshot) => boolean, timeoutMs = 2000): Promise<RoomSnapshot> {
    if (this.snap && pred(this.snap)) return Promise.resolve(this.snap);
    return new Promise((resolve, reject) => {
      const t = setTimeout(
        () => reject(new Error(`timeout; last phase=${this.snap?.phase} round=${this.snap?.round}`)),
        timeoutMs,
      );
      const onUpdate = (s: RoomSnapshot) => {
        if (pred(s)) {
          clearTimeout(t);
          this.socket.off('room_updated', onUpdate);
          resolve(s);
        }
      };
      this.socket.on('room_updated', onUpdate);
    });
  }

  close(): void {
    this.socket.disconnect();
  }
}

export async function client(url: string): Promise<TestClient> {
  const c = new TestClient(url);
  await c.connected();
  return c;
}

/** Create a room with A, join with B, both end in LOBBY. */
export async function setupLobby(url: string, timerSeconds = 15): Promise<{ a: TestClient; b: TestClient; code: string }> {
  const a = await client(url);
  const created = a.next<{ session: SessionInfo }>('room_created');
  a.socket.emit('create_room', { name: 'Alice', timerSeconds });
  const { session } = await created;
  const b = await client(url);
  const joined = b.next('room_joined');
  b.socket.emit('join_room', { roomCode: session.roomCode, name: 'Bob' });
  await joined;
  await a.until((s) => s.phase === 'LOBBY');
  return { a, b, code: session.roomCode };
}

export async function startGame(a: TestClient, b: TestClient): Promise<void> {
  a.socket.emit('start_game');
  await a.until((s) => s.phase === 'INITIAL_INPUT');
  await b.until((s) => s.phase === 'INITIAL_INPUT');
}

/** Both players lock a word; resolves after the reveal is shown to both. */
export async function playRound(a: TestClient, b: TestClient, wordA: string, wordB: string) {
  const isInitial = a.snap?.round === 0;
  const ev = isInitial ? 'submit_initial_word' : 'submit_answer';
  const revealA = a.next<{ round: number; answers: { A: string; B: string }; match: boolean }>('reveal_answers');
  a.socket.emit(ev, { word: wordA });
  b.socket.emit(ev, { word: wordB });
  return revealA;
}
