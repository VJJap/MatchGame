// Types and constants shared by the server and the client.
// The server is the single source of truth; the client only renders snapshots.

export const TIMER_OPTIONS = [15, 20, 30, 45, 60] as const;
export type TimerSeconds = (typeof TIMER_OPTIONS)[number];
export const DEFAULT_TIMER_SECONDS: TimerSeconds = 30;

export const ROOM_CODE_LENGTH = 6;
export const MAX_NAME_LENGTH = 20;
export const MAX_WORD_LENGTH = 30;
export const RECONNECT_GRACE_SECONDS = 60;

export type GamePhase =
  | 'WAITING_FOR_PLAYERS' // only the host is in the room
  | 'LOBBY' // two players, game not started
  | 'INITIAL_INPUT' // both players type their free first word
  | 'ROUND_INPUT' // both players type a word linking the two prompt words
  | 'WAITING_FOR_READY' // one player is ready, waiting for the other
  | 'COUNTDOWN' // both ready, 3-2-1
  | 'REVEAL' // answers revealed to both
  | 'GAME_OVER'; // words matched

/** A = host (room creator), B = guest. */
export type PlayerRole = 'A' | 'B';

export interface PublicPlayer {
  id: string;
  name: string;
  role: PlayerRole;
  isHost: boolean;
  connected: boolean;
  ready: boolean;
  wantsRematch: boolean;
}

export interface RoundRecord {
  /** 0 = opening (free) words, 1+ = linking rounds. */
  round: number;
  answers: Record<PlayerRole, string>;
  match: boolean;
}

export interface TimerState {
  remainingMs: number;
  totalMs: number;
  /** Paused while a player is disconnected. */
  paused: boolean;
}

export interface RoomSnapshot {
  roomCode: string;
  phase: GamePhase;
  timerSeconds: TimerSeconds;
  /** 0 = opening round (free word), 1+ = linking rounds. */
  round: number;
  /** The two words to link this round. null during the opening round / lobby. */
  prompt: Record<PlayerRole, string> | null;
  players: PublicPlayer[];
  you: {
    id: string;
    role: PlayerRole;
    isHost: boolean;
    /** Your own locked-in answer for this round (never the opponent's). */
    lockedAnswer: string | null;
    /** Words you have already revealed in this game — you may not reuse them. */
    usedWords: string[];
  };
  timer: TimerState | null;
  countdownRemainingMs: number | null;
  /** The most recent reveal (shown during REVEAL / GAME_OVER). */
  lastReveal: RoundRecord | null;
  history: RoundRecord[];
  winner: { word: string; rounds: number } | null;
}

export type ErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'INVALID_ROOM_CODE'
  | 'INVALID_NAME'
  | 'INVALID_SETTINGS'
  | 'EMPTY_ANSWER'
  | 'WORD_TOO_LONG'
  | 'DUPLICATE_WORD'
  | 'ALREADY_READY'
  | 'GAME_ALREADY_STARTED'
  | 'NOT_ENOUGH_PLAYERS'
  | 'INVALID_PHASE'
  | 'UNAUTHORIZED'
  | 'NOT_IN_ROOM'
  | 'SESSION_EXPIRED';

export interface GameError {
  code: ErrorCode;
  message: string;
}

export interface SessionInfo {
  roomCode: string;
  playerId: string;
  token: string;
}

// ---------- Socket.IO event maps ----------

export interface ClientToServerEvents {
  create_room: (p: { name: string; timerSeconds: number }) => void;
  /** playerId + token are sent when restoring a session after a disconnect / reload. */
  join_room: (p: { roomCode: string; name?: string; playerId?: string; token?: string }) => void;
  update_settings: (p: { timerSeconds: number }) => void;
  start_game: () => void;
  /** Lock in the opening word (round 0). Locking in = Ready. */
  submit_initial_word: (p: { word: string }) => void;
  /** Lock in a linking-round answer (round 1+). Locking in = Ready. */
  submit_answer: (p: { word: string }) => void;
  /** Generic Ready: locks in `word` for whichever input round is active. */
  player_ready: (p: { word: string }) => void;
  leave_room: () => void;
  request_rematch: () => void;
}

export interface ServerToClientEvents {
  room_created: (p: { session: SessionInfo; snapshot: RoomSnapshot }) => void;
  room_joined: (p: { session: SessionInfo; snapshot: RoomSnapshot; restored: boolean }) => void;
  player_joined: (p: { name: string; role: PlayerRole; reconnected: boolean }) => void;
  player_left: (p: {
    name: string;
    role: PlayerRole;
    reason: 'disconnected' | 'left';
    /** Present when reason = 'disconnected': how long the seat is kept. */
    graceMs?: number;
  }) => void;
  room_updated: (snapshot: RoomSnapshot) => void;
  game_started: (p: { timerSeconds: number }) => void;
  initial_words_revealed: (p: { words: Record<PlayerRole, string> }) => void;
  round_started: (p: { round: number; prompt: Record<PlayerRole, string> }) => void;
  player_ready_updated: (p: { role: PlayerRole; ready: boolean }) => void;
  countdown_started: (p: { durationMs: number }) => void;
  reveal_answers: (p: RoundRecord) => void;
  round_result: (p: { round: number; match: boolean }) => void;
  round_timeout: (p: { round: number; message: string }) => void;
  game_won: (p: { word: string; rounds: number }) => void;
  game_error: (p: GameError) => void;
  left_room: () => void;
}
