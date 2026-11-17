import { randomInt } from 'node:crypto';
import type { Namespace, Socket } from 'socket.io';
import { ROOM_CODE_LENGTH } from '../../../shared/types';
import {
  ROOM_CODE_ALPHABET,
  isValidName,
  isValidRoomCode,
  normalizeName,
  normalizeRoomCode,
} from '../../../shared/words';
import type { PlayerInternal, SeatedRoom } from './seatedRoom';

export interface WireError {
  code: string;
  message: string;
}

interface SocketData {
  roomCode?: string;
  playerId?: string;
}

// The generic layer only uses the events every game shares; games cast to their typed socket.
export type AnySocket = Socket;

export type Seat<R> = { room: R; player: PlayerInternal };

export interface GameHelpers<R> {
  /** The caller's room + seat, or emits NOT_IN_ROOM and returns null. */
  requireSeat: (socket: AnySocket) => Seat<R> | null;
  fail: (socket: AnySocket, error: WireError | null) => void;
}

export interface WireOptions<R extends SeatedRoom<unknown>, Settings> {
  nsp: Namespace;
  rooms: Map<string, R>;
  /** Room codes are unique across every game on the server. */
  isCodeTaken: (code: string) => boolean;
  maxRooms: number;
  parseCreate: (payload: Record<string, unknown>) => Settings | WireError;
  createRoom: (code: string, settings: Settings, onEmpty: () => void) => R;
  /** Register the game's own events. */
  register: (socket: AnySocket, helpers: GameHelpers<R>) => void;
}

export function obj(p: unknown): Record<string, unknown> {
  return p && typeof p === 'object' ? (p as Record<string, unknown>) : {};
}

export function generateRoomCode(isTaken: (code: string) => boolean): string {
  for (;;) {
    let code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
    if (!isTaken(code)) return code;
  }
}

function isWireError(v: unknown): v is WireError {
  return Boolean(v && typeof v === 'object' && 'code' in v && 'message' in v);
}

/**
 * Socket.IO handlers every 2-player game shares: create_room, join_room (fresh or session restore),
 * leave_room and disconnect. Game-specific events are added through `register`.
 */
export function wireSeatedGame<R extends SeatedRoom<unknown>, Settings>(opts: WireOptions<R, Settings>): void {
  const { nsp, rooms } = opts;

  const data = (s: AnySocket) => s.data as SocketData;

  function fail(socket: AnySocket, error: WireError | null): void {
    if (error) socket.emit('game_error', error);
  }

  function current(socket: AnySocket): Seat<R> | null {
    const { roomCode, playerId } = data(socket);
    if (!roomCode || !playerId) return null;
    const room = rooms.get(roomCode);
    const player = room?.findPlayer(playerId);
    if (!room || !player || player.socketId !== socket.id) return null;
    return { room, player };
  }

  function requireSeat(socket: AnySocket): Seat<R> | null {
    const seat = current(socket);
    if (!seat) fail(socket, { code: 'NOT_IN_ROOM', message: 'คุณไม่ได้อยู่ในห้อง ลองเข้าห้องใหม่อีกครั้ง' });
    return seat;
  }

  function bind(socket: AnySocket, room: R, player: PlayerInternal): void {
    data(socket).roomCode = room.code;
    data(socket).playerId = player.id;
    socket.join(room.code);
  }

  function leaveCurrent(socket: AnySocket): void {
    const seat = current(socket);
    // Leave the broadcast channel first so the leaver isn't told about their own departure.
    const code = data(socket).roomCode;
    if (code) socket.leave(code);
    socket.data = {};
    if (seat) seat.room.removePlayer(seat.player.role);
  }

  nsp.on('connection', (socket: AnySocket) => {
    socket.on('create_room', (payload: unknown) => {
      const p = obj(payload);
      const name = normalizeName(String(p.name ?? ''));
      if (!isValidName(name)) return fail(socket, { code: 'INVALID_NAME', message: 'กรุณากรอกชื่อ (1-20 ตัวอักษร)' });
      const settings = opts.parseCreate(p);
      if (isWireError(settings)) return fail(socket, settings);
      if (rooms.size >= opts.maxRooms) {
        return fail(socket, { code: 'ROOM_FULL', message: 'เซิร์ฟเวอร์เต็ม ลองใหม่อีกครั้งภายหลัง' });
      }

      leaveCurrent(socket);
      const code = generateRoomCode(opts.isCodeTaken);
      const room = opts.createRoom(code, settings, () => rooms.delete(code));
      rooms.set(code, room);
      const player = room.addPlayer(name, socket.id);
      bind(socket, room, player);
      socket.emit('room_created', { session: room.sessionFor(player), snapshot: room.snapshotFor(player.role) });
    });

    socket.on('join_room', (payload: unknown) => {
      const p = obj(payload);
      const roomCode = normalizeRoomCode(String(p.roomCode ?? ''));
      if (!isValidRoomCode(roomCode)) {
        return fail(socket, { code: 'INVALID_ROOM_CODE', message: 'รหัสห้องไม่ถูกต้อง (ต้องมี 6 ตัวอักษร)' });
      }
      const room = rooms.get(roomCode);

      // --- Restore a previous seat (reload / reconnect within the grace period)
      if (typeof p.playerId === 'string' && typeof p.token === 'string') {
        const player = room?.findPlayer(p.playerId);
        if (!room || !player || player.token !== p.token) {
          return fail(socket, {
            code: 'SESSION_EXPIRED',
            message: room ? 'หมดเวลากลับเข้าห้องแล้ว กรุณาเข้าห้องใหม่' : 'ไม่พบห้องนี้แล้ว อาจหมดเวลาหรือถูกปิดไปแล้ว',
          });
        }
        if (current(socket)?.room !== room) leaveCurrent(socket);
        const replaced = room.reattach(player, socket.id);
        if (replaced) {
          const old = nsp.sockets.get(replaced);
          if (old) {
            old.leave(room.code);
            old.data = {};
            old.emit('left_room');
          }
        }
        bind(socket, room, player);
        socket.emit('room_joined', {
          session: room.sessionFor(player),
          snapshot: room.snapshotFor(player.role),
          restored: true,
        });
        return;
      }

      // --- Fresh join
      const name = normalizeName(String(p.name ?? ''));
      if (!isValidName(name)) return fail(socket, { code: 'INVALID_NAME', message: 'กรุณากรอกชื่อ (1-20 ตัวอักษร)' });
      if (!room) return fail(socket, { code: 'ROOM_NOT_FOUND', message: `ไม่พบห้อง ${roomCode} ตรวจสอบรหัสอีกครั้ง` });
      if (current(socket)?.room === room) return fail(socket, { code: 'ROOM_FULL', message: 'คุณอยู่ในห้องนี้อยู่แล้ว' });
      if (room.isFull()) return fail(socket, { code: 'ROOM_FULL', message: 'ห้องนี้มีผู้เล่นครบ 2 คนแล้ว' });
      if (!room.acceptsNewPlayer()) {
        return fail(socket, { code: 'GAME_ALREADY_STARTED', message: 'ห้องนี้เริ่มเกมไปแล้ว' });
      }

      leaveCurrent(socket);
      const player = room.addPlayer(name, socket.id);
      bind(socket, room, player);
      socket.emit('room_joined', {
        session: room.sessionFor(player),
        snapshot: room.snapshotFor(player.role),
        restored: false,
      });
    });

    socket.on('leave_room', () => {
      leaveCurrent(socket);
      socket.emit('left_room');
    });

    socket.on('disconnect', () => {
      const seat = current(socket);
      if (seat) seat.room.handleDisconnect(seat.player, socket.id);
    });

    opts.register(socket, { requireSeat, fail });
  });
}
