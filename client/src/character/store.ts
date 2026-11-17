import { useSyncExternalStore } from 'react';
import type { CharErrorCode, CharGameError, CharSettings, CharSnapshot } from '../../../shared/character';
import type { PlayerRole, SessionInfo } from '../../../shared/types';
import { normalizeRoomCode } from '../../../shared/words';
import { goTo, lookupRoom } from '../lib/nav';
import { sfx } from '../lib/sound';
import { loadCharSession, saveCharSession, saveName } from '../lib/storage';
import { toast } from '../lib/toast';
import { charSocket as socket } from './socket';

export type Conn = 'connecting' | 'connected' | 'reconnecting';

export interface CharState {
  conn: Conn;
  snapshot: CharSnapshot | null;
  /** performance.now() when the snapshot arrived (timers are computed relative to it). */
  receivedAt: number;
  session: SessionInfo | null;
  pending: 'create' | 'join' | 'restore' | null;
  formError: string | null;
  /** Inline error for the clue / answer inputs. */
  fieldError: (CharGameError & { at: number }) | null;
  opponentAwayUntil: number | null;
  prefillCode: string;
  /** Last Agree / Disagree, for the short verdict flash. */
  verdict: { agree: boolean; judgeName: string; by: PlayerRole; at: number } | null;
}

const FIELD_ERRORS: ReadonlySet<CharErrorCode> = new Set([
  'EMPTY_FIELD',
  'TOO_LONG',
  'CHARACTER_USED',
  'ANSWER_REJECTED_BEFORE',
  'ALREADY_READY',
]);

let state: CharState = {
  conn: 'connecting',
  snapshot: null,
  receivedAt: 0,
  session: null,
  pending: null,
  formError: null,
  fieldError: null,
  opponentAwayUntil: null,
  prefillCode: '',
  verdict: null,
};

const subs = new Set<() => void>();
function set(patch: Partial<CharState>): void {
  state = { ...state, ...patch };
  subs.forEach((f) => f());
}

export function useChar(): CharState {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => state,
  );
}

let activated = false;

/** Called when the MatchCharacter screen opens: reads ?room= + this tab's session, then connects. */
export function activateCharacter(): void {
  if (activated) return;
  activated = true;
  const p = new URLSearchParams(location.search).get('room');
  const urlRoom = p ? normalizeRoomCode(p).slice(0, 6) : '';
  let session = loadCharSession();
  if (session && urlRoom && session.roomCode !== urlRoom) {
    saveCharSession(null);
    session = null;
  }
  set({ session, pending: session ? 'restore' : null, prefillCode: urlRoom });
  socket.connect();
}

export function deactivateCharacter(): void {
  if (!activated || state.session) return;
  activated = false;
  socket.disconnect();
  set({ conn: 'connecting', prefillCode: '', formError: null, pending: null });
}

// ------------------------------------------------------------------ helpers

function applySnapshot(snapshot: CharSnapshot): void {
  const opp = snapshot.players.find((p) => p.role !== snapshot.you.role);
  set({
    snapshot,
    receivedAt: performance.now(),
    opponentAwayUntil: opp && !opp.connected ? state.opponentAwayUntil : null,
  });
  goTo('character', snapshot.roomCode);
}

function enterRoom(session: SessionInfo, snapshot: CharSnapshot): void {
  saveCharSession(session);
  set({ session, pending: null, formError: null, fieldError: null, prefillCode: '' });
  applySnapshot(snapshot);
}

function exitRoom(prefillCode = ''): void {
  saveCharSession(null);
  set({
    session: null,
    snapshot: null,
    pending: null,
    fieldError: null,
    opponentAwayUntil: null,
    verdict: null,
    prefillCode,
  });
  goTo('character', prefillCode || null);
}

const myRole = () => state.snapshot?.you.role;
const nameOf = (role: PlayerRole) => state.snapshot?.players.find((p) => p.role === role)?.name ?? role;
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

socket.on('clue_ready_updated', ({ role }) => {
  if (role !== myRole()) sfx.ready();
});

socket.on('clues_revealed', () => {
  set({ fieldError: null });
  setTimeout(() => sfx.whoosh(), 150);
});

socket.on('answer_buzzed', () => {
  set({ fieldError: null });
  sfx.buzzer();
});

socket.on('answer_judged', ({ agree, judgeName, attempt }) => {
  set({ verdict: { agree, judgeName, by: attempt.by, at: Date.now() } });
  if (agree) sfx.agree();
  else sfx.wrong();
  if (!agree && attempt.by === myRole()) toast(`${judgeName} ไม่เห็นด้วย — แก้คำตอบแล้วลองใหม่ได้`, 'warn');
  if (!agree && attempt.by !== myRole()) toast(`คุณไม่เห็นด้วย — กลับไปแข่งตอบต่อ!`, 'info', 2400);
});

socket.on('round_ended', ({ outcome }) => {
  if (outcome.type === 'scored') setTimeout(() => sfx.point(), 250);
  else if (outcome.type === 'timeout') sfx.timeout();
});

socket.on('game_won', () => {
  setTimeout(() => sfx.fanfare(), 200);
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
    // A Match Word code typed into MatchCharacter: take the player to the right game.
    if (joining && e.code === 'ROOM_NOT_FOUND') {
      void lookupRoom(joining).then((r) => {
        if (r.ok && r.game === 'word') {
          set({ formError: null });
          toast(`ห้อง ${r.code} เป็นเกม Match Word — พาไปให้แล้ว`, 'info');
          deactivateCharacter();
          goTo('word', r.code);
        }
      });
    }
    return;
  }
  if (FIELD_ERRORS.has(e.code)) {
    set({ fieldError: { ...e, at: Date.now() } });
    return;
  }
  if (e.code === 'ALREADY_ANSWERED') return; // the buzz overlay already tells the story
  if (e.code === 'NOT_IN_ROOM') exitRoom(state.snapshot?.roomCode ?? '');
  toast(e.message, 'error');
});

socket.on('left_room', () => {
  if (!leavingOnPurpose && state.snapshot) toast('ห้องนี้ถูกเปิดในหน้าต่างอื่นแล้ว', 'warn', 5000);
  leavingOnPurpose = false;
  if (state.snapshot || state.session) exitRoom();
});

// ------------------------------------------------------------------ actions

export const charActions = {
  createRoom(name: string, settings: CharSettings) {
    saveName(name);
    set({ pending: 'create', formError: null });
    socket.emit('create_room', { name, ...settings });
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
  clearFieldError() {
    if (state.fieldError) set({ fieldError: null });
  },
  updateSettings(patch: Partial<CharSettings>) {
    socket.emit('update_settings', patch);
  },
  startGame() {
    socket.emit('start_game');
  },
  submitClue(clue: string) {
    set({ fieldError: null });
    socket.emit('submit_clue', { clue });
    sfx.ready();
  },
  submitAnswer(character: string, title: string) {
    set({ fieldError: null });
    socket.emit('submit_answer', { character, title });
  },
  judge(agree: boolean) {
    socket.emit('judge_answer', { agree });
  },
  voteSkip(skip: boolean) {
    socket.emit('vote_skip', { skip });
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

export { nameOf as charNameOf };

// Holds a live socket / module state: in dev, reload the page instead of hot-swapping (the session restores the seat).
if (import.meta.hot) import.meta.hot.accept(() => window.location.reload());
