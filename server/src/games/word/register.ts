import type { Namespace } from 'socket.io';
import { DEFAULT_TIMER_SECONDS, TIMER_OPTIONS, type TimerSeconds } from '../../../../shared/types';
import type { GameConfig } from '../../config';
import { obj, wireSeatedGame, type AnySocket } from '../../core/wire';
import { WordRoom, type AnswerKind } from './room';

function toTimerSeconds(value: unknown): TimerSeconds | null {
  const n = Number(value);
  return (TIMER_OPTIONS as readonly number[]).includes(n) ? (n as TimerSeconds) : null;
}

/** Match Word lives on the default Socket.IO namespace ("/"). */
export function registerWordGame(
  nsp: Namespace,
  rooms: Map<string, WordRoom>,
  config: GameConfig,
  isCodeTaken: (code: string) => boolean,
): void {
  wireSeatedGame<WordRoom, TimerSeconds>({
    nsp,
    rooms,
    isCodeTaken,
    maxRooms: config.maxRooms,
    parseCreate: (p) => {
      const t = p.timerSeconds === undefined ? DEFAULT_TIMER_SECONDS : toTimerSeconds(p.timerSeconds);
      return t ?? { code: 'INVALID_SETTINGS', message: 'เวลาต่อรอบไม่ถูกต้อง' };
    },
    createRoom: (code, timerSeconds, onEmpty) => new WordRoom(code, timerSeconds, nsp, config, onEmpty),
    register: (socket: AnySocket, { requireSeat, fail }) => {
      socket.on('update_settings', (payload: unknown) => {
        const seat = requireSeat(socket);
        if (!seat) return;
        const timerSeconds = toTimerSeconds(obj(payload).timerSeconds);
        if (!timerSeconds) return fail(socket, { code: 'INVALID_SETTINGS', message: 'เวลาต่อรอบไม่ถูกต้อง' });
        fail(socket, seat.room.updateSettings(seat.player.role, timerSeconds));
      });

      socket.on('start_game', () => {
        const seat = requireSeat(socket);
        if (seat) fail(socket, seat.room.startGame(seat.player.role));
      });

      const lockHandler = (kind: AnswerKind) => (payload: unknown) => {
        const seat = requireSeat(socket);
        if (seat) fail(socket, seat.room.lockAnswer(seat.player.role, obj(payload).word, kind));
      };
      socket.on('submit_initial_word', lockHandler('initial'));
      socket.on('submit_answer', lockHandler('round'));
      socket.on('player_ready', lockHandler('any'));

      socket.on('request_rematch', () => {
        const seat = requireSeat(socket);
        if (seat) fail(socket, seat.room.requestRematch(seat.player.role));
      });
    },
  });
}
