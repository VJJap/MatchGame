import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkAnswer, characterKey, type CharSettings } from '../../shared/character';
import { createGameServer, type GameServer } from '../src/app';
import type { AddressInfo } from 'node:net';
import { client as wordClient } from './helpers';
import { FAST_CHAR, answerAndJudge, charClient, charLobby, playClues, type CharClient } from './charHelpers';

let server: GameServer;
let url: string;
const clients: { close: () => void }[] = [];
const track = <T extends { close: () => void }>(c: T) => (clients.push(c), c);

beforeEach(async () => {
  server = createGameServer({ character: FAST_CHAR });
  await new Promise<void>((r) => server.httpServer.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(server.httpServer.address() as AddressInfo).port}`;
});
afterEach(async () => {
  for (const c of clients.splice(0)) c.close();
  await server.close();
});

async function lobby(settings: Partial<CharSettings> = {}) {
  const r = await charLobby(url, settings);
  track(r.a);
  track(r.b);
  return r;
}

/** Started game, both players in round 1's clue phase. No clock unless a test asks for one. */
async function started(settings: Partial<CharSettings> = {}) {
  const r = await lobby({ answerSeconds: 0, ...settings });
  r.a.socket.emit('start_game');
  await r.a.until((s) => s.phase === 'CLUE_INPUT' && s.round === 1);
  await r.b.until((s) => s.phase === 'CLUE_INPUT' && s.round === 1);
  return r;
}

const score = (c: CharClient, role: 'A' | 'B') => c.snap!.players.find((p) => p.role === role)!.score;

describe('rules helpers', () => {
  it('detects used characters case/space-insensitively and rejected answers', () => {
    expect(characterKey('  Son   GOKU ')).toBe('son goku');
    const used = [{ character: 'Goku', round: 1 }];
    expect(checkAnswer(' goku ', 'DB', used, [])).toMatchObject({ ok: false, code: 'CHARACTER_USED' });
    expect(checkAnswer('Vegeta', '', used, [])).toMatchObject({ ok: false, code: 'EMPTY_FIELD' });
    const rejected = [{ character: 'Naruto', title: 'Naruto' }];
    expect(checkAnswer('naruto', ' NARUTO', [], rejected)).toMatchObject({ ok: false, code: 'ANSWER_REJECTED_BEFORE' });
    expect(checkAnswer('Naruto', 'Boruto', [], rejected)).toMatchObject({ ok: true });
  });
});

describe('lobby & settings', () => {
  it('creates a room with settings, shares the code space with Match Word, and is discoverable by code', async () => {
    const { a, code } = await lobby({ category: 'movie', targetScore: 3, answerSeconds: 0 });
    expect(a.snap!.settings).toEqual({ category: 'movie', targetScore: 3, answerSeconds: 0 });

    const res = await fetch(`${url}/api/rooms/${code}`);
    expect(await res.json()).toMatchObject({ exists: true, game: 'character', full: true });
    expect((await fetch(`${url}/api/rooms/ZZZZZZ`)).status).toBe(404);

    // A Match Word client can't join a MatchCharacter room.
    const w = track(await wordClient(url));
    const e = w.next<{ code: string }>('game_error');
    w.socket.emit('join_room', { roomCode: code, name: 'Wendy' });
    expect((await e).code).toBe('ROOM_NOT_FOUND');
  });

  it('validates settings and only the host may change them before the game', async () => {
    const c = track(await charClient(url));
    expect(await c.expectError(() => c.socket.emit('create_room', { name: 'X', category: 'cartoon' as never }))).toBe(
      'INVALID_SETTINGS',
    );
    const { a, b } = await lobby();
    expect(await b.expectError(() => b.socket.emit('update_settings', { targetScore: 7 }))).toBe('UNAUTHORIZED');
    a.socket.emit('update_settings', { category: 'series', targetScore: 7, answerSeconds: 180 });
    await b.until((s) => s.settings.category === 'series' && s.settings.targetScore === 7);
    expect(await a.expectError(() => a.socket.emit('update_settings', { answerSeconds: 45 as never }))).toBe(
      'INVALID_SETTINGS',
    );
  });
});

describe('clue round', () => {
  it('keeps clues private until both are ready, then reveals both and starts the race with a running clock', async () => {
    const { a, b } = await started({ answerSeconds: 60 });
    a.socket.emit('submit_clue', { clue: 'ผมทองลับสุดยอด' });
    const bs = await b.until((s) => s.players.find((p) => p.role === 'A')!.clueReady);
    expect(bs.you.lockedClue).toBeNull();
    expect(bs.clues).toBeNull();
    expect(JSON.stringify(b.events)).not.toContain('ผมทองลับสุดยอด');
    expect(await a.expectError(() => a.socket.emit('submit_clue', { clue: 'อื่น' }))).toBe('ALREADY_READY');

    const revealed = b.next<{ clues: { A: string; B: string } }>('clues_revealed');
    b.socket.emit('submit_clue', { clue: '  มีพลังพิเศษ ' });
    expect((await revealed).clues).toEqual({ A: 'ผมทองลับสุดยอด', B: 'มีพลังพิเศษ' });
    const s = await a.until((x) => x.phase === 'RACING');
    expect(s.timer).toMatchObject({ paused: false, totalMs: 600 });
  });

  it('rejects an empty clue', async () => {
    const { a } = await started();
    expect(await a.expectError(() => a.socket.emit('submit_clue', { clue: '   ' }))).toBe('EMPTY_FIELD');
  });
});

describe('answer race', () => {
  it('first answer wins the buzz; the other judges; Agree = +1 and a new round', async () => {
    const { a, b } = await started({ answerSeconds: 60 });
    await playClues(a, b);

    const buzz = b.next<{ name: string; attempt: { character: string } }>('answer_buzzed');
    a.socket.emit('submit_answer', { character: 'Goku', title: 'Dragon Ball' });
    expect(await buzz).toMatchObject({ name: 'Alice', attempt: { character: 'Goku' } });
    await b.until((s) => s.phase === 'BUZZED');

    // B was still typing: too late now.
    expect(await b.expectError(() => b.socket.emit('submit_answer', { character: 'Naruto', title: 'Naruto' }))).toBe(
      'ALREADY_ANSWERED',
    );
    const s = await b.until((x) => x.phase === 'REVIEW');
    expect(s.pending).toMatchObject({ by: 'A', character: 'Goku', title: 'Dragon Ball', verdict: 'pending' });
    expect(s.timer?.paused).toBe(true);
    expect(await a.expectError(() => a.socket.emit('judge_answer', { agree: true }))).toBe('UNAUTHORIZED');

    const ended = a.next<{ outcome: { type: string; by: string }; scores: { A: number } }>('round_ended');
    b.socket.emit('judge_answer', { agree: true });
    expect(await ended).toMatchObject({ outcome: { type: 'scored', by: 'A' }, scores: { A: 1, B: 0 } });
    const r2 = await a.until((x) => x.phase === 'CLUE_INPUT' && x.round === 2);
    expect(score(a, 'A')).toBe(1);
    expect(r2.usedCharacters).toEqual([{ character: 'Goku', title: 'Dragon Ball', by: 'A', round: 1 }]);
    expect(r2.history[0]).toMatchObject({ round: 1, clues: { A: 'ผมสีทอง', B: 'มีพลังพิเศษ' }, attempts: 1 });
  });

  it('Disagree sends everyone back to the race with the same clues; the answerer may edit (not resend) their answer', async () => {
    const { a, b } = await started({ answerSeconds: 60 });
    await playClues(a, b);
    const before = (await a.until((s) => s.phase === 'RACING')).timer!.remainingMs;

    const judged = await answerAndJudge(a, b, 'Naruto', 'Naruto', false);
    expect(judged.agree).toBe(false);
    const s = await a.until((x) => x.phase === 'RACING' && x.attempts.length === 1);
    expect(s.clues).toEqual({ A: 'ผมสีทอง', B: 'มีพลังพิเศษ' });
    expect(s.attempts[0].verdict).toBe('disagreed');
    expect(s.timer!.paused).toBe(false);
    expect(s.timer!.remainingMs).toBeLessThanOrEqual(before);
    expect(score(a, 'A')).toBe(0);

    expect(
      await a.expectError(() => a.socket.emit('submit_answer', { character: ' naruto', title: 'NARUTO ' })),
    ).toBe('ANSWER_REJECTED_BEFORE');

    // The other player can still win the round.
    const ended = a.next<{ outcome: { by: string } }>('round_ended');
    await answerAndJudge(b, a, 'Naruto', 'Naruto', true); // B may use what A was refused
    expect((await ended).outcome.by).toBe('B');
  });

  it('a character that already scored cannot be used again in the game', async () => {
    const { a, b } = await started();
    await playClues(a, b);
    await answerAndJudge(a, b, 'Goku', 'Dragon Ball', true);
    await a.until((s) => s.phase === 'CLUE_INPUT' && s.round === 2);
    await playClues(a, b, 'ใส่ชุดส้ม', 'กินเยอะ');
    expect(await b.expectError(() => b.socket.emit('submit_answer', { character: '  GOKU ', title: 'DBZ' }))).toBe(
      'CHARACTER_USED',
    );
  });

  it('timeout ends the round with no points', async () => {
    const { a, b } = await started({ answerSeconds: 60 }); // 600 ms in tests
    await playClues(a, b);
    const ended = await a.next<{ outcome: { type: string }; scores: { A: number; B: number } }>(
      'round_ended',
      () => true,
      3000,
    );
    expect(ended).toMatchObject({ outcome: { type: 'timeout' }, scores: { A: 0, B: 0 } });
    await b.until((s) => s.phase === 'CLUE_INPUT' && s.round === 2);
  });

  it('the clock is paused while an answer is judged', async () => {
    const { a, b } = await started({ answerSeconds: 60 }); // 600 ms
    await playClues(a, b);
    a.socket.emit('submit_answer', { character: 'Vegeta', title: 'Dragon Ball' });
    await b.until((s) => s.phase === 'REVIEW');
    await new Promise((r) => setTimeout(r, 750)); // longer than the whole clock
    expect(b.snap!.phase).toBe('REVIEW');
    b.socket.emit('judge_answer', { agree: false });
    const s = await a.until((x) => x.phase === 'RACING' && x.attempts.length === 1);
    expect(s.timer!.remainingMs).toBeGreaterThan(0);
  });

  it('skip needs both players', async () => {
    const { a, b } = await started();
    await playClues(a, b);
    a.socket.emit('vote_skip', { skip: true });
    await b.until((s) => s.players.find((p) => p.role === 'A')!.wantsSkip);
    expect(b.snap!.phase).toBe('RACING');
    a.socket.emit('vote_skip', { skip: false });
    await b.until((s) => !s.players.find((p) => p.role === 'A')!.wantsSkip);
    const ended = a.next<{ outcome: { type: string } }>('round_ended');
    a.socket.emit('vote_skip', { skip: true });
    b.socket.emit('vote_skip', { skip: true });
    expect((await ended).outcome.type).toBe('skipped');
  });

  it('"no timer" setting has no clock', async () => {
    const { a, b } = await started({ answerSeconds: 0 });
    await playClues(a, b);
    expect(a.snap!.timer).toBeNull();
  });
});

describe('winning & rematch', () => {
  it('first to the target score wins; rematch returns to a clean lobby', async () => {
    const { a, b } = await started({ targetScore: 3 });
    const names = ['Goku', 'Vegeta', 'Gohan'];
    for (let i = 0; i < 3; i++) {
      await a.until((s) => s.phase === 'CLUE_INPUT' && s.round === i + 1);
      await playClues(a, b, `ใบ้ A${i}`, `ใบ้ B${i}`);
      await answerAndJudge(a, b, names[i], 'Dragon Ball', true);
    }
    const s = await b.until((x) => x.phase === 'GAME_OVER');
    expect(s.winner).toEqual({ role: 'A', name: 'Alice' });
    expect(s.players.map((p) => p.score)).toEqual([3, 0]);
    expect(s.history).toHaveLength(3);

    a.socket.emit('request_rematch');
    b.socket.emit('request_rematch');
    const l = await a.until((x) => x.phase === 'LOBBY');
    expect(l.players.map((p) => p.score)).toEqual([0, 0]);
    expect(l.usedCharacters).toEqual([]);
    expect(l.settings.targetScore).toBe(3);
  });
});

describe('disconnect / reconnect', () => {
  it('pauses the clock while a player is away and restores their seat', async () => {
    const { a, b, code } = await started({ answerSeconds: 60 });
    await playClues(a, b);
    const session = b.session!;
    b.close();
    const paused = await a.until((s) => s.players.some((p) => !p.connected));
    expect(paused.timer?.paused).toBe(true);
    await new Promise((r) => setTimeout(r, 750)); // longer than the clock: must not time out
    expect(a.snap!.phase).toBe('RACING');

    const b2 = track(await charClient(url));
    const joined = b2.next<{ restored: boolean }>('room_joined');
    b2.socket.emit('join_room', { roomCode: code, playerId: session.playerId, token: session.token });
    expect((await joined).restored).toBe(true);
    const resumed = await a.until((s) => s.players.every((p) => p.connected));
    expect(resumed.timer?.paused).toBe(false);
    expect(b2.snap!.clues).toEqual({ A: 'ผมสีทอง', B: 'มีพลังพิเศษ' });
  });

  it('host leaving for good resets the room and promotes the guest', async () => {
    const { a, b } = await started();
    const left = b.next<{ reason: string }>('player_left', (p) => p.reason === 'left');
    a.socket.emit('leave_room');
    await left;
    const s = await b.until((x) => x.phase === 'WAITING_FOR_PLAYERS');
    expect(s.you).toMatchObject({ role: 'A', isHost: true });
    expect(s.players.map((p) => p.score)).toEqual([0]);
  });
});
