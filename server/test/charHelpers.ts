import { io as ioc, type Socket } from 'socket.io-client';
import type {
  CharClientToServer,
  CharServerToClient,
  CharSettings,
  CharSnapshot,
} from '../../shared/character';
import type { SessionInfo } from '../../shared/types';
import type { CharacterConfig } from '../src/config';

export const FAST_CHAR: Partial<CharacterConfig> = {
  msPerTimerSecond: 10, // 60 "seconds" = 600 ms
  countdownMs: 30,
  clueRevealMs: 30,
  buzzMs: 30,
  roundEndMs: 30,
  reconnectGraceMs: 2000,
};

type Ev = keyof CharServerToClient;

export class CharClient {
  socket: Socket<CharServerToClient, CharClientToServer>;
  events: { name: string; payload: unknown }[] = [];
  snap: CharSnapshot | null = null;
  session: SessionInfo | null = null;

  constructor(url: string) {
    this.socket = ioc(`${url}/character`, { transports: ['websocket'], forceNew: true, reconnection: false });
    this.socket.onAny((name: string, payload: unknown) => {
      this.events.push({ name, payload });
      if (name === 'room_updated') this.snap = payload as CharSnapshot;
      if (name === 'room_created' || name === 'room_joined') {
        const p = payload as { session: SessionInfo; snapshot: CharSnapshot };
        this.session = p.session;
        this.snap = p.snapshot;
      }
    });
  }

  connected(): Promise<void> {
    if (this.socket.connected) return Promise.resolve();
    return new Promise((resolve) => this.socket.once('connect', () => resolve()));
  }

  next<T = unknown>(name: Ev, pred: (p: T) => boolean = () => true, timeoutMs = 2000): Promise<T> {
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

  until(pred: (s: CharSnapshot) => boolean, timeoutMs = 2000): Promise<CharSnapshot> {
    if (this.snap && pred(this.snap)) return Promise.resolve(this.snap);
    return new Promise((resolve, reject) => {
      const t = setTimeout(
        () => reject(new Error(`timeout; last phase=${this.snap?.phase} round=${this.snap?.round}`)),
        timeoutMs,
      );
      const onUpdate = (s: CharSnapshot) => {
        if (pred(s)) {
          clearTimeout(t);
          this.socket.off('room_updated', onUpdate);
          resolve(s);
        }
      };
      this.socket.on('room_updated', onUpdate);
    });
  }

  /** Emit an action and resolve with the game_error it causes. */
  async expectError(emit: () => void): Promise<string> {
    const e = this.next<{ code: string }>('game_error');
    emit();
    return (await e).code;
  }

  close(): void {
    this.socket.disconnect();
  }
}

export async function charClient(url: string): Promise<CharClient> {
  const c = new CharClient(url);
  await c.connected();
  return c;
}

export async function charLobby(
  url: string,
  settings: Partial<CharSettings> = {},
): Promise<{ a: CharClient; b: CharClient; code: string }> {
  const a = await charClient(url);
  const created = a.next<{ session: SessionInfo }>('room_created');
  a.socket.emit('create_room', { name: 'Alice', ...settings });
  const { session } = await created;
  const b = await charClient(url);
  const joined = b.next('room_joined');
  b.socket.emit('join_room', { roomCode: session.roomCode, name: 'Bob' });
  await joined;
  await a.until((s) => s.phase === 'LOBBY');
  return { a, b, code: session.roomCode };
}

/** Both lock a clue; resolves when both are in RACING. */
export async function playClues(a: CharClient, b: CharClient, clueA = 'ผมสีทอง', clueB = 'มีพลังพิเศษ') {
  // Both must be in the clue phase of the same round before we start.
  const { round } = await a.until((s) => s.phase === 'CLUE_INPUT');
  await b.until((s) => s.phase === 'CLUE_INPUT' && s.round === round);
  a.socket.emit('submit_clue', { clue: clueA });
  b.socket.emit('submit_clue', { clue: clueB });
  await a.until((s) => s.phase === 'RACING' && s.round === round);
  await b.until((s) => s.phase === 'RACING' && s.round === round);
}

/** `answerer` buzzes, `judge` waits for REVIEW and decides. */
export async function answerAndJudge(
  answerer: CharClient,
  judge: CharClient,
  character: string,
  title: string,
  agree: boolean,
) {
  answerer.socket.emit('submit_answer', { character, title });
  await judge.until((s) => s.phase === 'REVIEW');
  const judged = answerer.next<{ agree: boolean }>('answer_judged');
  judge.socket.emit('judge_answer', { agree });
  return judged;
}
