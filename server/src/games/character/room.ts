import { randomInt } from 'node:crypto';
import type { Namespace } from 'socket.io';
import {
  checkAnswer,
  checkClue,
  isAnswerSeconds,
  isCategory,
  isTargetScore,
  normalizeCategories,
  type AnswerAttempt,
  type Category,
  type CharacterImage,
  type CharGameError,
  type CharPhase,
  type CharPublicPlayer,
  type CharRoundSummary,
  type CharServerToClient,
  type CharSettings,
  type CharSnapshot,
  type RoundOutcome,
  type UsedCharacter,
} from '../../../../shared/character';
import type { PlayerRole, TimerState } from '../../../../shared/types';
import type { CharacterConfig } from '../../config';
import { ROLES, SeatedRoom, type PlayerInternal } from '../../core/seatedRoom';
import type { CharacterImageLookup } from './images';

/** Phases in which the answer clock exists (running in RACING, paused while an answer is judged). */
const CLOCK_PHASES: ReadonlySet<CharPhase> = new Set(['RACING', 'BUZZED', 'REVIEW']);

function err(code: CharGameError['code'], message: string): CharGameError {
  return { code, message };
}

/**
 * MatchCharacter — both players secretly type a trait, the two traits are revealed together,
 * then they race to name a character (+ its title) that has both. The other player judges the
 * answer: Agree = +1 point, Disagree = back to the race with the same clues (the answerer may
 * edit their answer). First to the target score wins.
 */
export class CharacterRoom extends SeatedRoom<CharSnapshot> {
  settings: CharSettings;
  phase: CharPhase = 'WAITING_FOR_PLAYERS';

  round = 0;
  /** Category of the current round, drawn from settings.categories. */
  roundCategory: Category | null = null;
  /** Shuffled categories still to come, so every chosen category appears before any repeats. */
  private categoryBag: Category[] = [];
  scores: Record<PlayerRole, number> = { A: 0, B: 0 };
  /** Private until both are locked. */
  lockedClues: Partial<Record<PlayerRole, string>> = {};
  clues: Record<PlayerRole, string> | null = null;
  attempts: AnswerAttempt[] = [];
  pending: AnswerAttempt | null = null;
  skipVotes = new Set<PlayerRole>();
  lastOutcome: RoundOutcome | null = null;
  history: CharRoundSummary[] = [];
  used: UsedCharacter[] = [];
  winner: { role: PlayerRole; name: string } | null = null;
  /** Unique for the room's lifetime (not reset on rematch), so a late image can't land on a newer answer. */
  private attemptSeq = 0;

  // ---- timers ----
  /** Countdown / reveal / buzz / round-end transitions. */
  private phaseTimer: NodeJS.Timeout | null = null;
  private countdownDeadline: number | null = null;
  /** The answer clock: running ⇔ answerDeadline !== null. */
  private answerTimer: NodeJS.Timeout | null = null;
  private answerDeadline: number | null = null;
  private answerRemainingMs: number | null = null;

  constructor(
    code: string,
    settings: CharSettings,
    nsp: Namespace,
    private readonly config: CharacterConfig,
    onEmpty: () => void,
    private readonly images: CharacterImageLookup,
  ) {
    super(code, nsp, config.reconnectGraceMs, onEmpty);
    this.settings = { ...settings };
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
    if (this.phase === 'RACING') this.pauseAnswerClock();
  }

  protected onPlayerBack(): void {
    if (this.phase === 'RACING') this.runAnswerClock();
  }

  protected onPlayerGone(): void {
    this.resetGame();
    this.phase = 'WAITING_FOR_PLAYERS';
  }

  protected onDestroy(): void {
    this.clearPhaseTimer();
    this.stopAnswerClock();
  }

  // =========================================================
  // Lobby
  // =========================================================

  updateSettings(role: PlayerRole, patch: Record<string, unknown>): CharGameError | null {
    if (role !== 'A') return err('UNAUTHORIZED', 'เฉพาะเจ้าของห้องเท่านั้นที่ตั้งค่าได้');
    if (this.phase !== 'LOBBY' && this.phase !== 'WAITING_FOR_PLAYERS') {
      return err('GAME_ALREADY_STARTED', 'ตั้งค่าได้เฉพาะก่อนเริ่มเกม');
    }
    const next = { ...this.settings };
    if (patch.categories !== undefined) {
      const list = normalizeCategories(patch.categories);
      if (!list) return err('INVALID_SETTINGS', 'เลือกหมวดหมู่อย่างน้อย 1 หมวด');
      next.categories = list;
    } else if (patch.category !== undefined) {
      if (!isCategory(patch.category)) return err('INVALID_SETTINGS', 'หมวดหมู่ไม่ถูกต้อง');
      next.categories = [patch.category];
    }
    if (patch.targetScore !== undefined) {
      if (!isTargetScore(patch.targetScore)) return err('INVALID_SETTINGS', 'แต้มเป้าหมายไม่ถูกต้อง');
      next.targetScore = patch.targetScore;
    }
    if (patch.answerSeconds !== undefined) {
      if (!isAnswerSeconds(patch.answerSeconds)) return err('INVALID_SETTINGS', 'เวลาตอบไม่ถูกต้อง');
      next.answerSeconds = patch.answerSeconds;
    }
    this.settings = next;
    this.broadcast();
    return null;
  }

  startGame(role: PlayerRole): CharGameError | null {
    if (role !== 'A') return err('UNAUTHORIZED', 'เฉพาะเจ้าของห้องเท่านั้นที่กดเริ่มเกมได้');
    if (this.phase === 'WAITING_FOR_PLAYERS') return err('NOT_ENOUGH_PLAYERS', 'ต้องมีผู้เล่นครบ 2 คนก่อนเริ่มเกม');
    if (this.phase !== 'LOBBY') return err('GAME_ALREADY_STARTED', 'เกมเริ่มไปแล้ว');
    if (!this.allConnected()) return err('NOT_ENOUGH_PLAYERS', 'อีกฝ่ายยังไม่ได้เชื่อมต่อ');
    this.resetGame();
    this.emit('game_started', { settings: this.settings });
    this.startRound(1);
    return null;
  }

  requestRematch(role: PlayerRole): CharGameError | null {
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
  // Round: clues
  // =========================================================

  private startRound(n: number): void {
    this.clearPhaseTimer();
    this.stopAnswerClock();
    this.round = n;
    this.roundCategory = this.drawCategory();
    this.lockedClues = {};
    this.clues = null;
    this.attempts = [];
    this.pending = null;
    this.skipVotes.clear();
    this.lastOutcome = null;
    this.answerRemainingMs = null;
    this.phase = 'CLUE_INPUT';
    this.broadcast();
  }

  /** Next category from the shuffled bag (never the same twice in a row when 2+ are chosen). */
  private drawCategory(): Category {
    const cats = this.settings.categories;
    if (cats.length === 1) return cats[0];
    if (!this.categoryBag.length) {
      const bag = [...cats];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      if (bag[0] === this.roundCategory) [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
      this.categoryBag = bag;
    }
    return this.categoryBag.shift()!;
  }

  submitClue(role: PlayerRole, raw: unknown): CharGameError | null {
    if (this.phase !== 'CLUE_INPUT') return err('INVALID_PHASE', 'ตอนนี้ยังส่งลักษณะเด่นไม่ได้');
    if (this.lockedClues[role] !== undefined) return err('ALREADY_READY', 'คุณกด Ready ไปแล้ว แก้ไขไม่ได้');
    const check = checkClue(raw);
    if (!check.ok) return err(check.code, check.message);
    this.lockedClues[role] = check.value;
    this.emit('clue_ready_updated', { role });
    if (this.lockedClues.A !== undefined && this.lockedClues.B !== undefined) this.startClueCountdown();
    else this.broadcast();
    return null;
  }

  private startClueCountdown(): void {
    this.clearPhaseTimer();
    this.phase = 'CLUE_COUNTDOWN';
    this.countdownDeadline = Date.now() + this.config.countdownMs;
    this.emit('countdown_started', { durationMs: this.config.countdownMs });
    this.broadcast();
    this.phaseTimer = setTimeout(() => this.revealClues(), this.config.countdownMs);
  }

  private revealClues(): void {
    this.phaseTimer = null;
    this.countdownDeadline = null;
    this.clues = { A: this.lockedClues.A ?? '', B: this.lockedClues.B ?? '' };
    this.phase = 'CLUE_REVEAL';
    this.emit('clues_revealed', { round: this.round, clues: this.clues });
    this.broadcast();
    this.phaseTimer = setTimeout(() => this.beginRacing(), this.config.clueRevealMs);
  }

  // =========================================================
  // Round: answer race
  // =========================================================

  private beginRacing(): void {
    this.phaseTimer = null;
    this.answerRemainingMs = this.answerTotalMs ?? null;
    this.phase = 'RACING';
    this.emit('racing_started', { round: this.round, resumed: false });
    this.runAnswerClock();
    this.broadcast();
  }

  submitAnswer(role: PlayerRole, character: unknown, title: unknown): CharGameError | null {
    if (this.phase === 'BUZZED' || this.phase === 'REVIEW') {
      return err('ALREADY_ANSWERED', 'อีกฝ่ายตอบก่อนแล้ว! รอผลตัดสินก่อนนะ');
    }
    if (this.phase !== 'RACING') return err('INVALID_PHASE', 'ตอนนี้ยังตอบไม่ได้');
    const rejected = this.attempts.filter((a) => a.by === role && a.verdict === 'disagreed');
    const check = checkAnswer(character, title, this.used, rejected);
    if (!check.ok) return err(check.code, check.message);

    const attempt: AnswerAttempt = { id: ++this.attemptSeq, by: role, ...check.value, verdict: 'pending' };
    this.attempts.push(attempt);
    this.pending = attempt;
    this.skipVotes.clear();
    this.pauseAnswerClock(); // the clock stops while the answer is being judged
    this.phase = 'BUZZED';
    this.emit('answer_buzzed', { attempt, name: this.players[role]?.name ?? role });
    this.broadcast();
    this.lookUpImage(attempt);
    this.phaseTimer = setTimeout(() => {
      this.phaseTimer = null;
      this.phase = 'REVIEW';
      this.broadcast();
    }, this.config.buzzMs);
    return null;
  }

  judgeAnswer(role: PlayerRole, agree: unknown): CharGameError | null {
    if (this.phase === 'BUZZED') return err('INVALID_PHASE', 'รอสักครู่ กำลังเปิดคำตอบ');
    if (this.phase !== 'REVIEW' || !this.pending) return err('INVALID_PHASE', 'ไม่มีคำตอบให้ตัดสินตอนนี้');
    if (role === this.pending.by) return err('UNAUTHORIZED', 'คุณตัดสินคำตอบของตัวเองไม่ได้');
    if (typeof agree !== 'boolean') return err('INVALID_SETTINGS', 'คำตัดสินไม่ถูกต้อง');

    const attempt = this.pending;
    const judgeName = this.players[role]?.name ?? role;
    this.pending = null;

    if (agree) {
      attempt.verdict = 'agreed';
      this.scores[attempt.by] += 1;
      const { character, title, by, id: attemptId, image } = attempt;
      this.used.push({ character, title, by, round: this.round, attemptId, image });
      this.emit('answer_judged', { attempt, agree: true, judgeName });
      this.endRound({ type: 'scored', by, character, title, attemptId, image });
      return null;
    }

    // Disagree: back to the race with the same clues; the clock continues where it stopped.
    attempt.verdict = 'disagreed';
    this.phase = 'RACING';
    this.emit('answer_judged', { attempt, agree: false, judgeName });
    this.emit('racing_started', { round: this.round, resumed: true });
    this.runAnswerClock();
    this.broadcast();
    return null;
  }

  voteSkip(role: PlayerRole, skip: unknown): CharGameError | null {
    if (this.phase !== 'RACING') return err('INVALID_PHASE', 'ขอข้ามรอบได้ระหว่างหาคำตอบเท่านั้น');
    if (skip === false) this.skipVotes.delete(role);
    else this.skipVotes.add(role);
    this.emit('skip_updated', { role, skip: this.skipVotes.has(role) });
    if (this.skipVotes.has('A') && this.skipVotes.has('B')) this.endRound({ type: 'skipped' });
    else this.broadcast();
    return null;
  }

  // =========================================================
  // Pictures (best effort, never blocks the game)
  // =========================================================

  private lookUpImage(attempt: AnswerAttempt): void {
    const { id, character, title } = attempt;
    this.images
      .find(this.currentCategory, character, title)
      .catch(() => null)
      .then((image) => this.applyImage(id, image ?? null));
  }

  /** Attach a looked-up picture to the answer and everything that copied it (used list, round history). */
  private applyImage(attemptId: number, image: CharacterImage | null): void {
    if (this.destroyed) return;
    let touched = false;
    const attempt = this.attempts.find((a) => a.id === attemptId);
    if (attempt) {
      attempt.image = image;
      touched = true;
    }
    for (const u of this.used) {
      if (u.attemptId === attemptId) {
        u.image = image;
        touched = true;
      }
    }
    for (const h of this.history) {
      if (h.outcome.type === 'scored' && h.outcome.attemptId === attemptId) {
        h.outcome.image = image;
        touched = true;
      }
    }
    if (this.lastOutcome?.type === 'scored' && this.lastOutcome.attemptId === attemptId) {
      this.lastOutcome.image = image;
      touched = true;
    }
    if (touched) this.broadcast();
  }

  private onAnswerTimeout(): void {
    this.answerTimer = null;
    this.answerDeadline = null;
    this.answerRemainingMs = 0;
    if (this.phase === 'RACING') this.endRound({ type: 'timeout' });
  }

  private endRound(outcome: RoundOutcome): void {
    this.clearPhaseTimer();
    this.stopAnswerClock();
    this.skipVotes.clear();
    this.lastOutcome = outcome;
    this.history.push({
      round: this.round,
      category: this.currentCategory,
      clues: this.clues ?? { A: '', B: '' },
      outcome,
      attempts: this.attempts.length,
    });
    this.phase = 'ROUND_END';
    this.emit('round_ended', { round: this.round, outcome, scores: { ...this.scores } });
    this.broadcast();
    this.phaseTimer = setTimeout(() => this.afterRoundEnd(), this.config.roundEndMs);
  }

  private afterRoundEnd(): void {
    this.phaseTimer = null;
    const o = this.lastOutcome;
    if (o?.type === 'scored' && this.scores[o.by] >= this.settings.targetScore) {
      this.phase = 'GAME_OVER';
      this.winner = { role: o.by, name: this.players[o.by]?.name ?? o.by };
      this.emit('game_won', { ...this.winner, scores: { ...this.scores } });
      this.broadcast();
      return;
    }
    this.startRound(this.round + 1);
  }

  // =========================================================
  // Answer clock
  // =========================================================

  /** Total ms per round, or undefined when the host chose "no timer". */
  private get answerTotalMs(): number | undefined {
    return this.settings.answerSeconds > 0 ? this.settings.answerSeconds * this.config.msPerTimerSecond : undefined;
  }

  /** Start / resume the clock from answerRemainingMs, if racing and everyone is connected. */
  private runAnswerClock(): void {
    if (this.answerTotalMs === undefined || this.answerRemainingMs === null) return;
    if (this.phase !== 'RACING' || !this.allConnected() || this.answerDeadline !== null) return;
    const ms = Math.max(0, this.answerRemainingMs);
    this.answerDeadline = Date.now() + ms;
    this.answerTimer = setTimeout(() => this.onAnswerTimeout(), ms);
  }

  private pauseAnswerClock(): void {
    if (this.answerDeadline === null) return;
    this.answerRemainingMs = Math.max(0, this.answerDeadline - Date.now());
    if (this.answerTimer) clearTimeout(this.answerTimer);
    this.answerTimer = null;
    this.answerDeadline = null;
  }

  private stopAnswerClock(): void {
    if (this.answerTimer) clearTimeout(this.answerTimer);
    this.answerTimer = null;
    this.answerDeadline = null;
  }

  private get currentCategory(): Category {
    return this.roundCategory ?? this.settings.categories[0];
  }

  private clearPhaseTimer(): void {
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
    this.phaseTimer = null;
  }

  private resetGame(): void {
    this.clearPhaseTimer();
    this.stopAnswerClock();
    this.countdownDeadline = null;
    this.answerRemainingMs = null;
    this.round = 0;
    this.roundCategory = null;
    this.categoryBag = [];
    this.scores = { A: 0, B: 0 };
    this.lockedClues = {};
    this.clues = null;
    this.attempts = [];
    this.pending = null;
    this.skipVotes.clear();
    this.lastOutcome = null;
    this.history = [];
    this.used = [];
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
    const total = this.answerTotalMs;
    if (total === undefined || !CLOCK_PHASES.has(this.phase)) return null;
    if (this.answerDeadline !== null) {
      return { remainingMs: Math.max(0, this.answerDeadline - Date.now()), totalMs: total, paused: false };
    }
    return { remainingMs: this.answerRemainingMs ?? total, totalMs: total, paused: true };
  }

  private publicPlayer(p: PlayerInternal): CharPublicPlayer {
    const cluePhase = this.phase === 'CLUE_INPUT' || this.phase === 'CLUE_COUNTDOWN';
    return {
      id: p.id,
      name: p.name,
      role: p.role,
      isHost: p.role === 'A',
      connected: p.connected,
      score: this.scores[p.role],
      clueReady: cluePhase && this.lockedClues[p.role] !== undefined,
      wantsSkip: this.skipVotes.has(p.role),
      wantsRematch: p.wantsRematch,
    };
  }

  /** Per-player view: the only private data is the viewer's own locked clue. */
  snapshotFor(role: PlayerRole): CharSnapshot {
    const me = this.players[role]!;
    return {
      roomCode: this.code,
      phase: this.phase,
      settings: this.settings,
      round: this.round,
      roundCategory: this.roundCategory,
      players: ROLES.flatMap((r) => (this.players[r] ? [this.publicPlayer(this.players[r])] : [])),
      you: { id: me.id, role, isHost: role === 'A', lockedClue: this.lockedClues[role] ?? null },
      clues: this.clues,
      timer: this.timerState(),
      countdownRemainingMs:
        this.phase === 'CLUE_COUNTDOWN' && this.countdownDeadline !== null
          ? Math.max(0, this.countdownDeadline - Date.now())
          : null,
      pending: this.pending,
      attempts: this.attempts,
      lastOutcome: this.lastOutcome,
      history: this.history,
      usedCharacters: this.used,
      winner: this.winner,
    };
  }

  private emit<E extends keyof CharServerToClient>(event: E, ...args: Parameters<CharServerToClient[E]>): void {
    this.emitRaw(event, ...args);
  }
}
