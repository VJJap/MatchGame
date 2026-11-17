import { RECONNECT_GRACE_SECONDS } from '../../shared/types';

export interface GameConfig {
  /** Real milliseconds per "timer second". 1000 in production; tests shrink it. */
  msPerTimerSecond: number;
  /** Length of the 3-2-1 countdown before a reveal. */
  countdownMs: number;
  /** How long a NOT MATCH reveal stays on screen before the next round starts. */
  revealMs: number;
  /** How long a MATCH reveal plays before the victory screen. */
  matchRevealMs: number;
  /** How long a disconnected player's seat is kept. */
  reconnectGraceMs: number;
  /** Safety cap on concurrent rooms held in memory. */
  maxRooms: number;
}

export const defaultGameConfig: GameConfig = {
  msPerTimerSecond: 1000,
  countdownMs: 3000,
  revealMs: 3200,
  matchRevealMs: 2600,
  reconnectGraceMs: RECONNECT_GRACE_SECONDS * 1000,
  maxRooms: 5000,
};

export interface CharacterConfig {
  /** Real milliseconds per "timer second". 1000 in production; tests shrink it. */
  msPerTimerSecond: number;
  /** 3-2-1 before the two clues are revealed. */
  countdownMs: number;
  /** How long the revealed clues are shown before the answer race starts. */
  clueRevealMs: number;
  /** Full-screen "A ได้คำตอบแล้ว!!" before the review page. */
  buzzMs: number;
  /** +1 / timeout / skipped result before the next round. */
  roundEndMs: number;
  reconnectGraceMs: number;
  maxRooms: number;
}

export const defaultCharacterConfig: CharacterConfig = {
  msPerTimerSecond: 1000,
  countdownMs: 3000,
  clueRevealMs: 2800,
  buzzMs: 1800,
  roundEndMs: 3400,
  reconnectGraceMs: RECONNECT_GRACE_SECONDS * 1000,
  maxRooms: 5000,
};
