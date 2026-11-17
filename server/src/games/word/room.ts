import type { Namespace } from 'socket.io';
import {
  type GameError,
  type GamePhase,
  type PlayerRole,
  type PublicPlayer,
  type RoomSnapshot,
  type RoundRecord,
  type ServerToClientEvents,
  type TimerSeconds,
  type TimerState,
} from '../../../../shared/types';
import { checkWord, isStrictMatch } from '../../../../shared/words';
import type { GameConfig } from '../../config';
import { ROLES, SeatedRoom, type PlayerInternal } from '../../core/seatedRoom';

/** Which input round a lock-in request is for. */
export type AnswerKind = 'initial' | 'round' | 'any';

const INPUT_PHASES: ReadonlySet<GamePhase> = new Set(['INITIAL_INPUT', 'ROUND_INPUT', 'WAITING_FOR_READY']);

export const TIMEOUT_MESSAGE = 'หมดเวลา! เริ่มรอบเดิมใหม่';

function err(code: GameError['code'], message: string): GameError {
  return { code, message };
}

/**
 * Match Word — one room = one game between Player A (host) and Player B (guest).
 * All game state and every timer lives here, on the server.
 */
export class WordRoom extends SeatedRoom<RoomSnapshot> {
  timerSeconds: TimerSeconds;
  phase: GamePhase = 'WAITING_FOR_PLAYERS';

  // ---- game state ----
  round = 0;
  prompt: Record<PlayerRole, string> | null = null;
  /** Private locked-in answers. Never sent to the opponent before reveal. */
  answers: Partial<Record<PlayerRole, string>> = {};
  usedWords: Record<PlayerRole, Set<string>> = { A: new Set(), B: new Set() };
  history: RoundRecord[] = [];
  lastReveal: RoundRecord | null = null;
  winner: { word: string; rounds: number } | null = null;

  // ---- timers ----
  private phaseTimer: NodeJS.Timeout | null = null;
  private timerDeadline: number | null = null;
  private timerPaused = false;
  private countdownDeadline: number | null = null;

  constructor(
    code: string,
    timerSeconds: TimerSeconds,
    nsp: Namespace,
    private readonly config: GameConfig,
    onEmpty: () => void,
  ) {
    super(code, nsp, config.reconnectGraceMs, onEmpty);
    this.timerSeconds = timerSeconds;
  }

  // =========================================================
  // Seat hooks
  // =========================================================

  acceptsNewPlayer(): boolean {
    return this.phase === 'WAITING_FOR_PLAYERS';
  }

  protected onRoomFilled(): void {
    if (this.phase === 'WAITING_FOR_PLAYERS') this.phase = 'LOBBY';
  }

  protected onPlayerDropped(): void {
    if (INPUT_PHASES.has(this.phase)) this.pauseInputTimer();
  }

  protected onPlayerBack(): void {
    // Resume a paused round with a fresh timer once everyone is back.
    if (INPUT_PHASES.has(this.phase) && this.timerPaused) this.startInputTimer();
  }

  protected onPlayerGone(): void {
    this.resetGame();
    this.phase = 'WAITING_FOR_PLAYERS';
  }

  protected onDestroy(): void {
    this.clearPhaseTimer();
  }

  // =========================================================
  // Lobby actions
  // =========================================================

  updateSettings(role: PlayerRole, timerSeconds: TimerSeconds): GameError | null {
    if (role !== 'A') return err('UNAUTHORIZED', 'เฉพาะเจ้าของห้องเท่านั้นที่ปรับเวลาได้');
    if (this.phase !== 'LOBBY' && this.phase !== 'WAITING_FOR_PLAYERS') {
      return err('GAME_ALREADY_STARTED', 'ปรับเวลาได้เฉพาะก่อนเริ่มเกม');
    }
    this.timerSeconds = timerSeconds;
    this.broadcast();
    return null;
  }

  startGame(role: PlayerRole): GameError | null {
    if (role !== 'A') return err('UNAUTHORIZED', 'เฉพาะเจ้าของห้องเท่านั้นที่กดเริ่มเกมได้');
    if (this.phase === 'WAITING_FOR_PLAYERS') return err('NOT_ENOUGH_PLAYERS', 'ต้องมีผู้เล่นครบ 2 คนก่อนเริ่มเกม');
    if (this.phase !== 'LOBBY') return err('GAME_ALREADY_STARTED', 'เกมเริ่มไปแล้ว');
    if (!this.allConnected()) return err('NOT_ENOUGH_PLAYERS', 'อีกฝ่ายยังไม่ได้เชื่อมต่อ');
    this.resetGame();
    this.phase = 'INITIAL_INPUT';
    this.round = 0;
    this.startInputTimer();
    this.emit('game_started', { timerSeconds: this.timerSeconds });
    this.broadcast();
    return null;
  }

  requestRematch(role: PlayerRole): GameError | null {
    if (this.phase !== 'GAME_OVER') return err('INVALID_PHASE', 'ขอเล่นใหม่ได้หลังจบเกมเท่านั้น');
    const player = this.players[role];
    if (!player) return err('NOT_IN_ROOM', 'ไม่พบผู้เล่นในห้อง');
    player.wantsRematch = true;
    if (this.players.A?.wantsRematch && this.players.B?.wantsRematch) {
      this.resetGame();
      this.phase = 'LOBBY';
    }
    this.broadcast();
    return null;
  }

  // =========================================================
  // Rounds
  // =========================================================

  /** Lock in a word for the current input round. Locking in = pressing Ready. */
  lockAnswer(role: PlayerRole, raw: unknown, kind: AnswerKind): GameError | null {
    if (!INPUT_PHASES.has(this.phase)) return err('INVALID_PHASE', 'ตอนนี้ยังส่งคำตอบไม่ได้');
    if (kind === 'initial' && this.round !== 0) return err('INVALID_PHASE', 'รอบคำเริ่มต้นจบไปแล้ว');
    if (kind === 'round' && this.round === 0) return err('INVALID_PHASE', 'ตอนนี้เป็นรอบคำเริ่มต้น');
    if (this.answers[role] !== undefined) return err('ALREADY_READY', 'คุณกด Ready ไปแล้ว แก้ไขคำตอบไม่ได้');

    const check = checkWord(typeof raw === 'string' ? raw : '', this.usedWords[role]);
    if (!check.ok) return err(check.code, check.message);

    this.answers[role] = check.word;
    this.emit('player_ready_updated', { role, ready: true });

    if (this.answers.A !== undefined && this.answers.B !== undefined) {
      this.startCountdown();
    } else {
      this.phase = 'WAITING_FOR_READY';
      this.broadcast();
    }
    return null;
  }

  private startCountdown(): void {
    this.clearPhaseTimer();
    this.timerDeadline = null;
    this.timerPaused = false;
    this.phase = 'COUNTDOWN';
    this.countdownDeadline = Date.now() + this.config.countdownMs;
    this.emit('countdown_started', { durationMs: this.config.countdownMs });
    this.broadcast();
    this.phaseTimer = setTimeout(() => this.reveal(), this.config.countdownMs);
  }

  private reveal(): void {
    this.phaseTimer = null;
    this.countdownDeadline = null;
    const A = this.answers.A ?? '';
    const B = this.answers.B ?? '';
    const record: RoundRecord = { round: this.round, answers: { A, B }, match: isStrictMatch(A, B) };
    this.usedWords.A.add(A);
    this.usedWords.B.add(B);
    this.history.push(record);
    this.lastReveal = record;
    this.phase = 'REVEAL';

    this.emit('reveal_answers', record);
    if (record.round === 0) this.emit('initial_words_revealed', { words: record.answers });
    this.emit('round_result', { round: record.round, match: record.match });
    this.broadcast();

    const delay = record.match ? this.config.matchRevealMs : this.config.revealMs;
    this.phaseTimer = setTimeout(() => this.afterReveal(), delay);
  }

  private afterReveal(): void {
    this.phaseTimer = null;
    const last = this.lastReveal;
    if (!last) return;
    if (last.match) {
      this.phase = 'GAME_OVER';
      this.winner = { word: last.answers.A, rounds: last.round };
      this.emit('game_won', this.winner);
      this.broadcast();
      return;
    }
    // Not matched: both latest answers become the new prompt.
    this.round += 1;
    this.prompt = { ...last.answers };
    this.answers = {};
    this.phase = 'ROUND_INPUT';
    this.startInputTimer();
    this.emit('round_started', { round: this.round, prompt: this.prompt });
    this.broadcast();
  }

  /** Time ran out: same round, same prompt, answers + ready reset, timer restarts. */
  private onInputTimeout(): void {
    this.phaseTimer = null;
    if (!INPUT_PHASES.has(this.phase)) return;
    this.answers = {};
    this.phase = this.round === 0 ? 'INITIAL_INPUT' : 'ROUND_INPUT';
    this.emit('round_timeout', { round: this.round, message: TIMEOUT_MESSAGE });
    this.startInputTimer();
    this.broadcast();
  }

  // =========================================================
  // Timer helpers
  // =========================================================

  private get roundTotalMs(): number {
    return this.timerSeconds * this.config.msPerTimerSecond;
  }

  private startInputTimer(): void {
    this.clearPhaseTimer();
    if (!this.allConnected()) {
      this.timerPaused = true;
      this.timerDeadline = null;
      return;
    }
    this.timerPaused = false;
    this.timerDeadline = Date.now() + this.roundTotalMs;
    this.phaseTimer = setTimeout(() => this.onInputTimeout(), this.roundTotalMs);
  }

  private pauseInputTimer(): void {
    this.clearPhaseTimer();
    this.timerPaused = true;
    this.timerDeadline = null;
  }

  private clearPhaseTimer(): void {
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
    this.phaseTimer = null;
  }

  private resetGame(): void {
    this.clearPhaseTimer();
    this.timerDeadline = null;
    this.timerPaused = false;
    this.countdownDeadline = null;
    this.round = 0;
    this.prompt = null;
    this.answers = {};
    this.usedWords = { A: new Set(), B: new Set() };
    this.history = [];
    this.lastReveal = null;
    this.winner = null;
    for (const r of ROLES) {
      const p = this.players[r];
      if (p) p.wantsRematch = false;
    }
  }

  // =========================================================
  // Output
  // =========================================================

  private timerState(): TimerState | null {
    if (!INPUT_PHASES.has(this.phase)) return null;
    const totalMs = this.roundTotalMs;
    if (this.timerPaused || this.timerDeadline === null) return { remainingMs: totalMs, totalMs, paused: true };
    return { remainingMs: Math.max(0, this.timerDeadline - Date.now()), totalMs, paused: false };
  }

  private publicPlayer(p: PlayerInternal): PublicPlayer {
    const inRound = INPUT_PHASES.has(this.phase) || this.phase === 'COUNTDOWN';
    return {
      id: p.id,
      name: p.name,
      role: p.role,
      isHost: p.role === 'A',
      connected: p.connected,
      ready: inRound && this.answers[p.role] !== undefined,
      wantsRematch: p.wantsRematch,
    };
  }

  /** Per-player view. Contains ONLY the viewer's own private answer. */
  snapshotFor(role: PlayerRole): RoomSnapshot {
    const me = this.players[role]!;
    return {
      roomCode: this.code,
      phase: this.phase,
      timerSeconds: this.timerSeconds,
      round: this.round,
      prompt: this.prompt,
      players: ROLES.flatMap((r) => (this.players[r] ? [this.publicPlayer(this.players[r])] : [])),
      you: {
        id: me.id,
        role,
        isHost: role === 'A',
        lockedAnswer: this.answers[role] ?? null,
        usedWords: [...this.usedWords[role]],
      },
      timer: this.timerState(),
      countdownRemainingMs:
        this.phase === 'COUNTDOWN' && this.countdownDeadline !== null
          ? Math.max(0, this.countdownDeadline - Date.now())
          : null,
      lastReveal: this.lastReveal,
      history: this.history,
      winner: this.winner,
    };
  }

  private emit<E extends keyof ServerToClientEvents>(event: E, ...args: Parameters<ServerToClientEvents[E]>): void {
    this.emitRaw(event, ...args);
  }
}
