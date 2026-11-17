import type { Namespace } from 'socket.io';
import {
  DEFAULT_CHAR_SETTINGS,
  isAnswerSeconds,
  isCategory,
  isTargetScore,
  type CharSettings,
} from '../../../../shared/character';
import type { CharacterConfig } from '../../config';
import { obj, wireSeatedGame, type AnySocket, type WireError } from '../../core/wire';
import type { CharacterImageLookup } from './images';
import { CharacterRoom } from './room';

function parseSettings(p: Record<string, unknown>): CharSettings | WireError {
  const s: CharSettings = { ...DEFAULT_CHAR_SETTINGS };
  if (p.category !== undefined) {
    if (!isCategory(p.category)) return { code: 'INVALID_SETTINGS', message: 'หมวดหมู่ไม่ถูกต้อง' };
    s.category = p.category;
  }
  if (p.targetScore !== undefined) {
    if (!isTargetScore(p.targetScore)) return { code: 'INVALID_SETTINGS', message: 'แต้มเป้าหมายไม่ถูกต้อง' };
    s.targetScore = p.targetScore;
  }
  if (p.answerSeconds !== undefined) {
    if (!isAnswerSeconds(p.answerSeconds)) return { code: 'INVALID_SETTINGS', message: 'เวลาตอบไม่ถูกต้อง' };
    s.answerSeconds = p.answerSeconds;
  }
  return s;
}

/** MatchCharacter lives on the "/character" Socket.IO namespace. */
export function registerCharacterGame(
  nsp: Namespace,
  rooms: Map<string, CharacterRoom>,
  config: CharacterConfig,
  isCodeTaken: (code: string) => boolean,
  images: CharacterImageLookup,
): void {
  wireSeatedGame<CharacterRoom, CharSettings>({
    nsp,
    rooms,
    isCodeTaken,
    maxRooms: config.maxRooms,
    parseCreate: parseSettings,
    createRoom: (code, settings, onEmpty) => new CharacterRoom(code, settings, nsp, config, onEmpty, images),
    register: (socket: AnySocket, { requireSeat, fail }) => {
      socket.on('update_settings', (payload: unknown) => {
        const seat = requireSeat(socket);
        if (seat) fail(socket, seat.room.updateSettings(seat.player.role, obj(payload)));
      });
      socket.on('start_game', () => {
        const seat = requireSeat(socket);
        if (seat) fail(socket, seat.room.startGame(seat.player.role));
      });
      socket.on('submit_clue', (payload: unknown) => {
        const seat = requireSeat(socket);
        if (seat) fail(socket, seat.room.submitClue(seat.player.role, obj(payload).clue));
      });
      socket.on('submit_answer', (payload: unknown) => {
        const seat = requireSeat(socket);
        const p = obj(payload);
        if (seat) fail(socket, seat.room.submitAnswer(seat.player.role, p.character, p.title));
      });
      socket.on('judge_answer', (payload: unknown) => {
        const seat = requireSeat(socket);
        if (seat) fail(socket, seat.room.judgeAnswer(seat.player.role, obj(payload).agree));
      });
      socket.on('vote_skip', (payload: unknown) => {
        const seat = requireSeat(socket);
        if (seat) fail(socket, seat.room.voteSkip(seat.player.role, obj(payload).skip));
      });
      socket.on('request_rematch', () => {
        const seat = requireSeat(socket);
        if (seat) fail(socket, seat.room.requestRematch(seat.player.role));
      });
    },
  });
}
