// MatchCharacter — types, constants and rules shared by the server and the client.
import type { GameError, PlayerRole, SessionInfo, TimerState } from './types';
import { visibleLength } from './words';

export type GameKind = 'word' | 'character';

// ------------------------------------------------------------------ settings

export const CATEGORIES = ['anime', 'series', 'movie'] as const;
export type Category = (typeof CATEGORIES)[number];

export const TARGET_SCORES = [3, 5, 7] as const;
export type TargetScore = (typeof TARGET_SCORES)[number];

/** Seconds to find an answer each round. 0 = no timer. */
export const ANSWER_TIME_OPTIONS = [60, 90, 120, 180, 0] as const;
export type AnswerSeconds = (typeof ANSWER_TIME_OPTIONS)[number];

export interface CharSettings {
  category: Category;
  targetScore: TargetScore;
  answerSeconds: AnswerSeconds;
}

export const DEFAULT_CHAR_SETTINGS: CharSettings = { category: 'anime', targetScore: 5, answerSeconds: 90 };

export const MAX_CLUE_LENGTH = 40;
export const MAX_CHARACTER_LENGTH = 40;
export const MAX_TITLE_LENGTH = 60;

export interface CategoryInfo {
  th: string;
  en: string;
  emoji: string;
  /** Label for the "from which title" field. */
  titleLabel: string;
  clueExamples: string[];
  answerExample: { character: string; title: string };
}

export const CATEGORY_INFO: Record<Category, CategoryInfo> = {
  anime: {
    th: 'อนิเมะ',
    en: 'Anime',
    emoji: '🍥',
    titleLabel: 'จากอนิเมะเรื่อง',
    clueExamples: ['ผมสีทอง', 'มีพลังพิเศษ', 'ใส่หมวกฟาง', 'ถือดาบ', 'เป็นนินจา', 'แปลงร่างได้'],
    answerExample: { character: 'Goku', title: 'Dragon Ball' },
  },
  series: {
    th: 'ซีรีส์',
    en: 'Series',
    emoji: '📺',
    titleLabel: 'จากซีรีส์เรื่อง',
    clueExamples: ['เป็นหมอ', 'ใส่แว่น', 'เป็นราชา', 'ชอบกาแฟ', 'เป็นนักสืบ', 'มีพี่น้องเยอะ'],
    answerExample: { character: 'Sherlock Holmes', title: 'Sherlock' },
  },
  movie: {
    th: 'หนัง',
    en: 'Movie',
    emoji: '🎬',
    titleLabel: 'จากหนังเรื่อง',
    clueExamples: ['ใส่ชุดเกราะ', 'บินได้', 'เป็นพ่อมด', 'ใส่หน้ากาก', 'มีแผลเป็น', 'เป็นโจรสลัด'],
    answerExample: { character: 'Iron Man', title: 'The Avengers' },
  },
};

// ------------------------------------------------------------------ state

export type CharPhase =
  | 'WAITING_FOR_PLAYERS'
  | 'LOBBY'
  | 'CLUE_INPUT' // both secretly type one trait
  | 'CLUE_COUNTDOWN' // both ready → 3-2-1
  | 'CLUE_REVEAL' // the two traits are shown
  | 'RACING' // first to submit character + title wins the buzz
  | 'BUZZED' // full-screen "A ได้คำตอบแล้ว!!"
  | 'REVIEW' // the other player Agrees / Disagrees
  | 'ROUND_END' // +1 / timeout / skipped
  | 'GAME_OVER';

export interface CharPublicPlayer {
  id: string;
  name: string;
  role: PlayerRole;
  isHost: boolean;
  connected: boolean;
  score: number;
  /** Locked a clue this round (the clue itself stays private until reveal). */
  clueReady: boolean;
  wantsSkip: boolean;
  wantsRematch: boolean;
}

export type Verdict = 'pending' | 'agreed' | 'disagreed';

export interface AnswerAttempt {
  id: number;
  by: PlayerRole;
  character: string;
  title: string;
  verdict: Verdict;
}

export type RoundOutcome =
  | { type: 'scored'; by: PlayerRole; character: string; title: string }
  | { type: 'timeout' }
  | { type: 'skipped' };

export interface CharRoundSummary {
  round: number;
  clues: Record<PlayerRole, string>;
  outcome: RoundOutcome;
  /** Number of answers submitted in the round (including disagreed ones). */
  attempts: number;
}

export interface UsedCharacter {
  character: string;
  title: string;
  by: PlayerRole;
  round: number;
}

export interface CharSnapshot {
  roomCode: string;
  phase: CharPhase;
  settings: CharSettings;
  round: number;
  players: CharPublicPlayer[];
  you: { id: string; role: PlayerRole; isHost: boolean; lockedClue: string | null };
  /** Both clues, once revealed for this round. */
  clues: Record<PlayerRole, string> | null;
  /** Answer timer — runs in RACING, shown paused during BUZZED / REVIEW. null = no timer / not racing. */
  timer: TimerState | null;
  countdownRemainingMs: number | null;
  /** The answer being judged (BUZZED / REVIEW). */
  pending: AnswerAttempt | null;
  /** All answers submitted this round. */
  attempts: AnswerAttempt[];
  lastOutcome: RoundOutcome | null;
  history: CharRoundSummary[];
  usedCharacters: UsedCharacter[];
  winner: { role: PlayerRole; name: string } | null;
}

// ------------------------------------------------------------------ events

export type CharErrorCode =
  | GameError['code']
  | 'EMPTY_FIELD'
  | 'TOO_LONG'
  | 'CHARACTER_USED'
  | 'ANSWER_REJECTED_BEFORE'
  | 'ALREADY_ANSWERED';

export interface CharGameError {
  code: CharErrorCode;
  message: string;
}

export interface CharClientToServer {
  create_room: (p: { name: string } & Partial<CharSettings>) => void;
  join_room: (p: { roomCode: string; name?: string; playerId?: string; token?: string }) => void;
  update_settings: (p: Partial<CharSettings>) => void;
  start_game: () => void;
  submit_clue: (p: { clue: string }) => void;
  submit_answer: (p: { character: string; title: string }) => void;
  judge_answer: (p: { agree: boolean }) => void;
  vote_skip: (p: { skip: boolean }) => void;
  leave_room: () => void;
  request_rematch: () => void;
}

export interface CharServerToClient {
  room_created: (p: { session: SessionInfo; snapshot: CharSnapshot }) => void;
  room_joined: (p: { session: SessionInfo; snapshot: CharSnapshot; restored: boolean }) => void;
  room_updated: (s: CharSnapshot) => void;
  player_joined: (p: { name: string; role: PlayerRole; reconnected: boolean }) => void;
  player_left: (p: { name: string; role: PlayerRole; reason: 'disconnected' | 'left'; graceMs?: number }) => void;
  game_started: (p: { settings: CharSettings }) => void;
  clue_ready_updated: (p: { role: PlayerRole }) => void;
  countdown_started: (p: { durationMs: number }) => void;
  clues_revealed: (p: { round: number; clues: Record<PlayerRole, string> }) => void;
  racing_started: (p: { round: number; resumed: boolean }) => void;
  answer_buzzed: (p: { attempt: AnswerAttempt; name: string }) => void;
  answer_judged: (p: { attempt: AnswerAttempt; agree: boolean; judgeName: string }) => void;
  skip_updated: (p: { role: PlayerRole; skip: boolean }) => void;
  round_ended: (p: { round: number; outcome: RoundOutcome; scores: Record<PlayerRole, number> }) => void;
  game_won: (p: { role: PlayerRole; name: string; scores: Record<PlayerRole, number> }) => void;
  game_error: (p: CharGameError) => void;
  left_room: () => void;
}

// ------------------------------------------------------------------ rules

export function cleanText(raw: unknown): string {
  return String(raw ?? '')
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Key used to detect a character that was already used (case / spacing insensitive). */
export function characterKey(name: string): string {
  return cleanText(name).toLocaleLowerCase('en');
}

function answerKey(character: string, title: string): string {
  return `${characterKey(character)}|${characterKey(title)}`;
}

/** The earlier scored entry for this character name, if any (case / spacing insensitive). */
export function findUsedCharacter<T extends Pick<UsedCharacter, 'character'>>(name: string, used: readonly T[]): T | undefined {
  const key = characterKey(name);
  return key ? used.find((u) => characterKey(u.character) === key) : undefined;
}

export type Check<T> = { ok: true; value: T } | { ok: false; code: CharErrorCode; message: string };

export function checkClue(raw: unknown): Check<string> {
  const clue = cleanText(raw);
  if (!clue) return { ok: false, code: 'EMPTY_FIELD', message: 'พิมพ์ลักษณะเด่นก่อนกด Ready' };
  if (visibleLength(clue) > MAX_CLUE_LENGTH) {
    return { ok: false, code: 'TOO_LONG', message: `ลักษณะเด่นยาวเกินไป (ไม่เกิน ${MAX_CLUE_LENGTH} ตัวอักษร)` };
  }
  return { ok: true, value: clue };
}

export function checkAnswer(
  rawCharacter: unknown,
  rawTitle: unknown,
  used: readonly Pick<UsedCharacter, 'character' | 'round'>[],
  /** This player's own disagreed answers in the current round. */
  rejected: readonly Pick<AnswerAttempt, 'character' | 'title'>[],
): Check<{ character: string; title: string }> {
  const character = cleanText(rawCharacter);
  const title = cleanText(rawTitle);
  if (!character || !title) return { ok: false, code: 'EMPTY_FIELD', message: 'กรอกทั้งชื่อตัวละครและชื่อเรื่องก่อนตอบ' };
  if (visibleLength(character) > MAX_CHARACTER_LENGTH) {
    return { ok: false, code: 'TOO_LONG', message: `ชื่อตัวละครยาวเกินไป (ไม่เกิน ${MAX_CHARACTER_LENGTH} ตัวอักษร)` };
  }
  if (visibleLength(title) > MAX_TITLE_LENGTH) {
    return { ok: false, code: 'TOO_LONG', message: `ชื่อเรื่องยาวเกินไป (ไม่เกิน ${MAX_TITLE_LENGTH} ตัวอักษร)` };
  }
  const dup = findUsedCharacter(character, used);
  if (dup) {
    return { ok: false, code: 'CHARACTER_USED', message: `"${dup.character}" ถูกใช้ไปแล้วในรอบที่ ${dup.round} — ห้ามตอบซ้ำทั้งเกม` };
  }
  const ak = answerKey(character, title);
  if (rejected.some((r) => answerKey(r.character, r.title) === ak)) {
    return { ok: false, code: 'ANSWER_REJECTED_BEFORE', message: 'คำตอบนี้โดน Disagree ไปแล้ว ลองแก้คำตอบใหม่' };
  }
  return { ok: true, value: { character, title } };
}

export function isCategory(v: unknown): v is Category {
  return typeof v === 'string' && (CATEGORIES as readonly string[]).includes(v);
}
export function isTargetScore(v: unknown): v is TargetScore {
  return (TARGET_SCORES as readonly unknown[]).includes(v);
}
export function isAnswerSeconds(v: unknown): v is AnswerSeconds {
  return (ANSWER_TIME_OPTIONS as readonly unknown[]).includes(v);
}
