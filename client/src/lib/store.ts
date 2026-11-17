import { useSyncExternalStore } from 'react';
import type { ErrorCode, GameError, RoomSnapshot, SessionInfo, TimerSeconds } from '../../../shared/types';
import { normalizeRoomCode } from '../../../shared/words';
import { goTo, lookupRoom } from './nav';
import { sfx } from './sound';
import { socket } from './socket';
import { loadSession, saveName, saveSession } from './storage';
import { toast } from './toast';

export { toast } from './toast';

export type Conn = 'connecting' | 'connected' | 'reconnecting';

export interface GameState {
  conn: Conn;
  snapshot: RoomSnapshot | null;
  /** performance.now() when the snapshot arrived — timers are computed relative to it. */
  receivedAt: number;
  session: SessionInfo | null;
  pending: 'create' | 'join' | 'restore' | null;
  formError: string | null;
  answerError: (GameError & { at: number }) | null;
  /** Date.now() deadline for a disconnected opponent to come back. */
  opponentAwayUntil: number | null;
  /** Incremented on every round timeout (drives the timeout banner + input reset). */
  timeoutSignal: number;
  prefillCode: string;
}

const WORD_ERRORS: ReadonlySet<ErrorCode> = new Set(['EMPTY_ANSWER', 'WORD_TOO_LONG', 'DUPLICATE_WORD', 'ALREADY_READY']);

let state: GameState = {
  conn: 'connecting',
  snapshot: null,
  receivedAt: 0,
  session: null,
  pending: null,
  formError: null,
  answerError: null,
  opponentAwayUntil: null,
  timeoutSignal: 0,
  prefillCode: '',
};

let activated = false;

/**
 * Called when the Match Word screen opens: reads ?room= and this tab's session, then connects.
 * (The socket stays idle while the visitor is on the game picker or the other game.)
 */
export function activateWord(): void {
  if (activated) return;
  activated = true;
  const p = new URLSearchParams(location.search).get('room');
  const urlRoom = p ? normalizeRoomCode(p).slice(0, 6) : '';
  let session = loadSession();
  // An invite link for a different room wins over an old session in this tab.
  if (session && urlRoom && session.roomCode !== urlRoom) {
    saveSession(null);
    session = null;
  }
  set({ session, pending: session ? 'restore' : null, prefillCode: urlRoom });
  socket.connect();
}

/** Leaving Match Word for the picker (only when not seated in a room). */
export function deactivateWord(): void {
  if (!activated || state.session) return;
  activated = false;
  socket.disconnect();
  set({ conn: 'connecting', prefillCode: '', formError: null, pending: null });
}

const subs = new Set<() => void>();
function set(patch: Partial<GameState>): void {
  state = { ...state, ...patch };
  subs.forEach((f) => f());
}

export function useGame(): GameState {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => state,
  );
}

// ------------------------------------------------------------------ helpers

function setUrlRoom(code: string | null): void {
  goTo('word', code);
}

function applySnapshot(snapshot: RoomSnapshot): void {
  const opp = snapshot.players.find((p) => p.role !== snapshot.you.role);
  set({
    snapshot,
    receivedAt: performance.now(),
    opponentAwayUntil: opp && !opp.connected ? state.opponentAwayUntil : null,
  });
  setUrlRoom(snapshot.roomCode);
}

function enterRoom(session: SessionInfo, snapshot: RoomSnapshot): void {
  saveSession(session);
  set({ session, pending: null, formError: null, answerError: null, prefillCode: '' });
  applySnapshot(snapshot);
}

function exitRoom(prefillCode = ''): void {
  saveSession(null);
  set({
    session: null,
    snapshot: null,
    pending: null,
    answerError: null,
    opponentAwayUntil: null,
    prefillCode,
  });
  setUrlRoom(prefillCode || null);
}

const myRole = () => state.snapshot?.you.role;
let leavingOnPurpose = false;
let lastJoinCode = '';

// ------------------------------------------------------------------ socket events

socket.on('connect', () => {
  set({ conn: 'connected' });
  if (state.session) {
    set({ pending: 'restore' });
    const { roomCode, playerId, token } = state.session;
    socket.emit('join_room', { roomCode, playerId, token });
  }
});

socket.on('disconnect', (reason) => {
  set({ conn: 'reconnecting' });
  if (reason === 'io server disconnect') socket.connect();
});

socket.io.on('reconnect_attempt', () => {
  if (state.conn !== 'reconnecting') set({ conn: 'reconnecting' });
});

socket.on('room_created', ({ session, snapshot }) => {
  enterRoom(session, snapshot);
  sfx.join();
});

socket.on('room_joined', ({ session, snapshot, restored }) => {
  const wasInRoom = Boolean(state.snapshot);
  enterRoom(session, snapshot);
  if (restored && wasInRoom) toast('เชื่อมต่อกลับเข้าห้องแล้ว', 'success', 2200);
  if (!restored) sfx.join();
});

socket.on('room_updated', applySnapshot);

socket.on('player_joined', ({ name, role, reconnected }) => {
  if (role === myRole()) return;
  set({ opponentAwayUntil: null });
  toast(reconnected ? `${name} กลับเข้ามาแล้ว` : `${name} เข้าร่วมห้องแล้ว`, 'success');
  sfx.join();
});

socket.on('player_left', ({ name, role, reason, graceMs }) => {
  if (!state.snapshot || role === myRole()) return;
  if (reason === 'disconnected') {
    set({ opponentAwayUntil: Date.now() + (graceMs ?? 60_000) });
    toast(`${name} หลุดการเชื่อมต่อ กำลังรอกลับมา…`, 'warn');
  } else {
    set({ opponentAwayUntil: null });
    toast(`${name} ออกจากเกมแล้ว`, 'warn', 5000);
  }
});

socket.on('player_ready_updated', ({ role, ready }) => {
  if (ready && role !== myRole()) sfx.ready();
});

socket.on('reveal_answers', ({ match }) => {
  setTimeout(() => (match ? sfx.match() : sfx.mismatch()), 650);
});

socket.on('round_timeout', () => {
  set({ timeoutSignal: state.timeoutSignal + 1, answerError: null });
  sfx.timeout();
});

socket.on('game_error', (e) => {
  if (state.pending === 'restore') {
    const code = state.session?.roomCode ?? '';
    exitRoom(code);
    toast(e.message, 'warn', 5000);
    return;
  }
  if (state.pending === 'create' || state.pending === 'join') {
    const joining = state.pending === 'join' ? lastJoinCode : '';
    set({ pending: null, formError: e.message });
    // A MatchCharacter code typed into Match Word: take the player to the right game.
    if (joining && e.code === 'ROOM_NOT_FOUND') {
      void lookupRoom(joining).then((r) => {
        if (r.ok && r.game === 'character') {
          set({ formError: null });
          toast(`ห้อง ${r.code} เป็นเกม MatchCharacter — พาไปให้แล้ว`, 'info');
          deactivateWord();
          goTo('character', r.code);
        }
      });
    }
    return;
  }
  if (WORD_ERRORS.has(e.code)) {
    set({ answerError: { ...e, at: Date.now() } });
    return;
  }
  if (e.code === 'NOT_IN_ROOM') {
    exitRoom(state.snapshot?.roomCode ?? '');
  }
  toast(e.message, 'error');
});

socket.on('left_room', () => {
  if (!leavingOnPurpose && state.snapshot) {
    toast('ห้องนี้ถูกเปิดในหน้าต่างอื่นแล้ว', 'warn', 5000);
  }
  leavingOnPurpose = false;
  if (state.snapshot || state.session) exitRoom();
});

// ------------------------------------------------------------------ actions

export const actions = {
  createRoom(name: string, timerSeconds: TimerSeconds) {
    saveName(name);
    set({ pending: 'create', formError: null });
    socket.emit('create_room', { name, timerSeconds });
  },
  joinRoom(roomCode: string, name: string) {
    saveName(name);
    lastJoinCode = normalizeRoomCode(roomCode);
    set({ pending: 'join', formError: null });
    socket.emit('join_room', { roomCode: normalizeRoomCode(roomCode), name });
  },
  clearFormError() {
    if (state.formError) set({ formError: null });
  },
  updateTimer(timerSeconds: TimerSeconds) {
    socket.emit('update_settings', { timerSeconds });
  },
  startGame() {
    socket.emit('start_game');
  },
  lockWord(word: string) {
    set({ answerError: null });
    if (state.snapshot?.round === 0) socket.emit('submit_initial_word', { word });
    else socket.emit('submit_answer', { word });
    sfx.ready();
  },
  clearAnswerError() {
    if (state.answerError) set({ answerError: null });
  },
  rematch() {
    socket.emit('request_rematch');
  },
  leave() {
    leavingOnPurpose = true;
    socket.emit('leave_room');
    exitRoom();
  },
};

// Holds a live socket / module state: in dev, reload the page instead of hot-swapping (the session restores the seat).
if (import.meta.hot) import.meta.hot.accept(() => window.location.reload());
