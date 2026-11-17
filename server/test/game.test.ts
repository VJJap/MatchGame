import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GameError, RoomSnapshot } from '../../shared/types';
import type { GameServer } from '../src/app';
import { client, playRound, setupLobby, startGame, startServer, type TestClient } from './helpers';

let server: GameServer;
let url: string;
const clients: TestClient[] = [];
const track = <T extends TestClient>(c: T) => (clients.push(c), c);

beforeEach(async () => {
  ({ server, url } = await startServer());
});
afterEach(async () => {
  for (const c of clients.splice(0)) c.close();
  await server.close();
});

async function lobby() {
  const r = await setupLobby(url);
  track(r.a);
  track(r.b);
  return r;
}

describe('rooms', () => {
  it('creates a 6-character room and lets a second player join', async () => {
    const { a, b, code } = await lobby();
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
    expect(a.snap!.players.map((p) => [p.name, p.role, p.isHost])).toEqual([
      ['Alice', 'A', true],
      ['Bob', 'B', false],
    ]);
    expect(b.snap!.you.role).toBe('B');
    expect(a.events.some((e) => e.name === 'player_joined')).toBe(true);
  });

  it('rejects a third player, unknown rooms and invalid codes', async () => {
    const { code } = await lobby();
    const c = track(await client(url));

    let e = c.next<GameError>('game_error');
    c.socket.emit('join_room', { roomCode: code, name: 'Carol' });
    expect((await e).code).toBe('ROOM_FULL');

    e = c.next<GameError>('game_error');
    c.socket.emit('join_room', { roomCode: 'ZZZZZZ', name: 'Carol' });
    expect((await e).code).toBe('ROOM_NOT_FOUND');

    e = c.next<GameError>('game_error');
    c.socket.emit('join_room', { roomCode: 'AB', name: 'Carol' });
    expect((await e).code).toBe('INVALID_ROOM_CODE');
  });

  it('only the host can start, and only with two players', async () => {
    const a = track(await client(url));
    const created = a.next('room_created');
    a.socket.emit('create_room', { name: 'Alice', timerSeconds: 20 });
    await created;
    let e = a.next<GameError>('game_error');
    a.socket.emit('start_game');
    expect((await e).code).toBe('NOT_ENOUGH_PLAYERS');

    const b = track(await client(url));
    const joined = b.next('room_joined');
    b.socket.emit('join_room', { roomCode: a.snap!.roomCode, name: 'Bob' });
    await joined;
    e = b.next<GameError>('game_error');
    b.socket.emit('start_game');
    expect((await e).code).toBe('UNAUTHORIZED');
    expect(a.snap!.timerSeconds).toBe(20);
  });

  it('host can change the timer in the lobby (allowed values only)', async () => {
    const { a, b } = await lobby();
    a.socket.emit('update_settings', { timerSeconds: 45 });
    await b.until((s) => s.timerSeconds === 45);
    const e = a.next<GameError>('game_error');
    a.socket.emit('update_settings', { timerSeconds: 99 });
    expect((await e).code).toBe('INVALID_SETTINGS');
  });
});

describe('gameplay', () => {
  it('keeps answers private until the reveal, then uses them as the next prompt', async () => {
    const { a, b } = await lobby();
    await startGame(a, b);

    const readyEvent = b.next('player_ready_updated');
    a.socket.emit('submit_initial_word', { word: 'กาแฟลับมาก' });
    expect(await readyEvent).toEqual({ role: 'A', ready: true });
    const bSnap = await b.until((s) => s.players.find((p) => p.role === 'A')!.ready);
    expect(bSnap.phase).toBe('WAITING_FOR_READY');
    expect(bSnap.you.lockedAnswer).toBeNull();
    // Nothing B has received so far may contain A's secret word.
    expect(JSON.stringify(b.events)).not.toContain('กาแฟลับมาก');
    await a.until((s) => s.you.lockedAnswer === 'กาแฟลับมาก');

    const countdown = b.next<{ durationMs: number }>('countdown_started');
    const reveal = b.next<{ answers: { A: string; B: string }; match: boolean }>('reveal_answers');
    b.socket.emit('submit_initial_word', { word: 'โรงเรียน' });
    expect((await countdown).durationMs).toBeGreaterThan(0);
    expect(JSON.stringify(b.events)).not.toContain('กาแฟลับมาก'); // still hidden during the countdown
    const r = await reveal;
    expect(r).toMatchObject({ answers: { A: 'กาแฟลับมาก', B: 'โรงเรียน' }, match: false });

    const s = await a.until((x) => x.phase === 'ROUND_INPUT');
    expect(s.round).toBe(1);
    expect(s.prompt).toEqual({ A: 'กาแฟลับมาก', B: 'โรงเรียน' });
    expect(s.players.every((p) => !p.ready)).toBe(true);
    expect(s.history).toHaveLength(1);
  });

  it('locks the answer after Ready (cannot change it)', async () => {
    const { a, b } = await lobby();
    await startGame(a, b);
    a.socket.emit('submit_initial_word', { word: 'หนึ่ง' });
    await a.until((s) => s.you.lockedAnswer === 'หนึ่ง');
    const e = a.next<GameError>('game_error');
    a.socket.emit('player_ready', { word: 'สอง' });
    expect((await e).code).toBe('ALREADY_READY');
    expect(a.snap!.you.lockedAnswer).toBe('หนึ่ง');
  });

  it('rejects empty answers and the player’s own repeated words, but allows the opponent’s words', async () => {
    const { a, b } = await lobby();
    await startGame(a, b);

    let e = a.next<GameError>('game_error');
    a.socket.emit('submit_initial_word', { word: '   ' });
    expect((await e).code).toBe('EMPTY_ANSWER');

    await playRound(a, b, 'กาแฟ', 'โรงเรียน');
    await a.until((s) => s.phase === 'ROUND_INPUT');

    e = a.next<GameError>('game_error');
    a.socket.emit('submit_answer', { word: ' กาแฟ ' });
    expect((await e).code).toBe('DUPLICATE_WORD');
    expect(a.snap!.you.usedWords).toEqual(['กาแฟ']);
    expect(a.snap!.players.find((p) => p.role === 'A')!.ready).toBe(false);

    // The opponent's word is allowed.
    a.socket.emit('submit_answer', { word: 'โรงเรียน' });
    await a.until((s) => s.you.lockedAnswer === 'โรงเรียน');
  });

  it('wrong event for the round kind is rejected', async () => {
    const { a, b } = await lobby();
    await startGame(a, b);
    const e = a.next<GameError>('game_error');
    a.socket.emit('submit_answer', { word: 'x' });
    expect((await e).code).toBe('INVALID_PHASE');
  });

  it('plays until both type the same word (strict), then ends the game', async () => {
    const { a, b } = await lobby();
    await startGame(a, b);

    expect((await playRound(a, b, 'กาแฟ', 'โรงเรียน')).match).toBe(false);
    await a.until((s) => s.phase === 'ROUND_INPUT' && s.round === 1);

    // Synonyms / variants never match.
    expect((await playRound(a, b, 'ไอติม', 'ไอศกรีม')).match).toBe(false);
    await a.until((s) => s.round === 2 && s.phase === 'ROUND_INPUT');
    expect(a.snap!.prompt).toEqual({ A: 'ไอติม', B: 'ไอศกรีม' });

    expect((await playRound(a, b, 'Apple', 'apple')).match).toBe(false);
    await a.until((s) => s.round === 3 && s.phase === 'ROUND_INPUT');

    const won = b.next<{ word: string; rounds: number }>('game_won');
    const r = await playRound(a, b, ' ง่วง', 'ง่วง ');
    expect(r.match).toBe(true);
    expect(await won).toEqual({ word: 'ง่วง', rounds: 3 });
    const s = await a.until((x) => x.phase === 'GAME_OVER');
    expect(s.winner).toEqual({ word: 'ง่วง', rounds: 3 });
    expect(s.history.map((h) => h.match)).toEqual([false, false, false, true]);
  });

  it('timeout restarts the same round without revealing or changing the round number', async () => {
    const { a, b } = await lobby(); // 15 s × 20 ms = 300 ms per round in tests
    await startGame(a, b);
    await playRound(a, b, 'กาแฟ', 'โรงเรียน');
    await a.until((s) => s.phase === 'ROUND_INPUT' && s.round === 1);

    const timeout = b.next<{ round: number; message: string }>('round_timeout', 3000);
    a.socket.emit('submit_answer', { word: 'ตอนเช้า' });
    await b.until((s) => s.phase === 'WAITING_FOR_READY');
    const t = await timeout;
    expect(t).toEqual({ round: 1, message: 'หมดเวลา! เริ่มรอบเดิมใหม่' });

    const s = await a.until((x) => x.phase === 'ROUND_INPUT' && x.you.lockedAnswer === null);
    expect(s.round).toBe(1);
    expect(s.prompt).toEqual({ A: 'กาแฟ', B: 'โรงเรียน' });
    expect(s.players.every((p) => !p.ready)).toBe(true);
    expect(s.history).toHaveLength(1);
    expect(s.timer && !s.timer.paused && s.timer.remainingMs > 0).toBe(true);
    expect(b.events.some((e) => e.name === 'reveal_answers' && JSON.stringify(e.payload).includes('ตอนเช้า'))).toBe(
      false,
    );
    // The timed-out word was never revealed, so it is not "used".
    a.socket.emit('submit_answer', { word: 'ตอนเช้า' });
    await a.until((x) => x.you.lockedAnswer === 'ตอนเช้า');
  });

  it('play again: both must agree, then the room returns to the lobby with a clean slate', async () => {
    const { a, b } = await lobby();
    await startGame(a, b);
    await playRound(a, b, 'แมว', 'แมว');
    await a.until((s) => s.phase === 'GAME_OVER');
    expect(a.snap!.winner).toEqual({ word: 'แมว', rounds: 0 });

    a.socket.emit('request_rematch');
    await b.until((s) => s.players.find((p) => p.role === 'A')!.wantsRematch);
    expect(b.snap!.phase).toBe('GAME_OVER');
    b.socket.emit('request_rematch');
    const s = await a.until((x) => x.phase === 'LOBBY');
    expect(s.history).toEqual([]);
    expect(s.you.usedWords).toEqual([]);
    await startGame(a, b);
    await playRound(a, b, 'แมว', 'หมา'); // previous game's words are allowed again
  });
});

describe('disconnect / reconnect', () => {
  it('restores the seat and state within the grace period; timer pauses meanwhile', async () => {
    const { a, b, code } = await lobby();
    await startGame(a, b);
    await playRound(a, b, 'กาแฟ', 'โรงเรียน');
    await a.until((s) => s.phase === 'ROUND_INPUT');
    b.socket.emit('submit_answer', { word: 'ง่วง' });
    await b.until((s) => s.you.lockedAnswer === 'ง่วง');
    const session = b.session!;

    const left = a.next<{ reason: string; graceMs: number }>('player_left');
    b.close();
    expect(await left).toMatchObject({ reason: 'disconnected' });
    const paused = await a.until((s) => s.players.some((p) => !p.connected));
    expect(paused.timer?.paused).toBe(true);

    const b2 = track(await client(url));
    const back = a.next<{ reconnected: boolean }>('player_joined');
    const joined = b2.next<{ restored: boolean; snapshot: RoomSnapshot }>('room_joined');
    b2.socket.emit('join_room', { roomCode: code, playerId: session.playerId, token: session.token });
    const j = await joined;
    expect(j.restored).toBe(true);
    expect(j.snapshot.you.role).toBe('B');
    expect(j.snapshot.round).toBe(1);
    expect(j.snapshot.you.lockedAnswer).toBe('ง่วง');
    expect(j.snapshot.you.usedWords).toEqual(['โรงเรียน']);
    expect((await back).reconnected).toBe(true);
    const resumed = await a.until((s) => s.players.every((p) => p.connected));
    expect(resumed.timer?.paused).toBe(false);

    // Game continues normally.
    const won = a.next('game_won');
    a.socket.emit('submit_answer', { word: 'ง่วง' });
    await won;
  });

  it('a wrong token cannot take over a seat', async () => {
    const { b, code } = await lobby();
    const c = track(await client(url));
    const e = c.next<GameError>('game_error');
    c.socket.emit('join_room', { roomCode: code, playerId: b.session!.playerId, token: 'nope' });
    expect((await e).code).toBe('SESSION_EXPIRED');
  });

  it('if the player does not return in time, the other is told and becomes host of an open room', async () => {
    const { a, b, code } = await lobby();
    await startGame(a, b);
    const dropped = b.nextWhere<{ reason: string }>('player_left', (p) => p.reason === 'disconnected');
    const gone = b.nextWhere<{ reason: string; name: string }>('player_left', (p) => p.reason === 'left', 3000);
    a.close(); // the host drops and never comes back
    await dropped;
    expect(await gone).toMatchObject({ reason: 'left', name: 'Alice' });
    const s = await b.until((x) => x.phase === 'WAITING_FOR_PLAYERS');
    expect(s.you).toMatchObject({ role: 'A', isHost: true });
    expect(s.players).toHaveLength(1);

    // A new player can now take the free seat.
    const c = track(await client(url));
    const joined = c.next('room_joined');
    c.socket.emit('join_room', { roomCode: code, name: 'Carol' });
    await joined;
    await b.until((x) => x.phase === 'LOBBY');
  });

  it('leave_room frees the seat immediately; empty rooms are deleted', async () => {
    const { a, b, code } = await lobby();
    const left = a.next('left_room');
    a.socket.emit('leave_room');
    await left;
    await b.until((s) => s.phase === 'WAITING_FOR_PLAYERS');
    const done = b.next('left_room');
    b.socket.emit('leave_room');
    await done;
    expect(server.rooms.has(code)).toBe(false);
  });
});
