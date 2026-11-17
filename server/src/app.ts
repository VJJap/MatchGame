import { existsSync } from 'node:fs';
import { createServer, type Server as HttpServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import express from 'express';
import { Server } from 'socket.io';
import type { GameKind } from '../../shared/character';
import { isValidRoomCode, normalizeRoomCode } from '../../shared/words';
import {
  defaultCharacterConfig,
  defaultGameConfig,
  type CharacterConfig,
  type GameConfig,
} from './config';
import { createImageLookup, noImageLookup, type CharacterImageLookup } from './games/character/images';
import { registerCharacterGame } from './games/character/register';
import type { CharacterRoom } from './games/character/room';
import { registerWordGame } from './games/word/register';
import type { WordRoom } from './games/word/room';

export interface AppOptions {
  /** Allowed browser origins for Socket.IO when the client is hosted elsewhere. Empty = allow any. */
  corsOrigins?: string[];
  /** Directory of the built client (served as a SPA when it exists). */
  staticDir?: string;
  /** Match Word timings. */
  game?: Partial<GameConfig>;
  /** MatchCharacter timings. */
  character?: Partial<CharacterConfig>;
  /** Where MatchCharacter answer pictures come from (default: AniList + Wikipedia; CHARACTER_IMAGES=off disables). */
  characterImages?: CharacterImageLookup;
}

export interface GameServer {
  httpServer: HttpServer;
  io: Server;
  /** Match Word rooms. */
  rooms: Map<string, WordRoom>;
  characterRooms: Map<string, CharacterRoom>;
  close: () => Promise<void>;
}

export const CHARACTER_NAMESPACE = '/character';

/**
 * CLIENT_ORIGIN entries: exact origins ("https://matchgame.vercel.app") or a wildcard host
 * ("https://*.vercel.app", handy for Vercel preview deployments). An empty list allows any origin.
 */
export function isOriginAllowed(origin: string, allowed: string[]): boolean {
  if (!allowed.length) return true;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  return allowed.some((entry) => {
    const e = entry.replace(/\/$/, '');
    if (!e.includes('*')) return e === origin;
    const m = e.match(/^(https?):\/\/\*\.(.+)$/);
    return Boolean(m && url.protocol === `${m[1]}:` && url.hostname.endsWith(`.${m[2]}`));
  });
}

export function createGameServer(options: AppOptions = {}): GameServer {
  const wordConfig: GameConfig = { ...defaultGameConfig, ...options.game };
  const charConfig: CharacterConfig = { ...defaultCharacterConfig, ...options.character };
  const rooms = new Map<string, WordRoom>();
  const characterRooms = new Map<string, CharacterRoom>();
  // Room codes are unique across both games, so one code box can route to the right game.
  const isCodeTaken = (code: string) => rooms.has(code) || characterRooms.has(code);

  const app = express();
  app.disable('x-powered-by');

  // When the client is hosted elsewhere (e.g. Vercel), the browser calls /api cross-origin.
  const corsOrigins = options.corsOrigins ?? [];
  app.use('/api', (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && isOriginAllowed(origin, corsOrigins)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    }
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, rooms: rooms.size, characterRooms: characterRooms.size });
  });

  // Which game does a room code belong to? (used by the game-picker's "join by code" box)
  app.get('/api/rooms/:code', (req, res) => {
    const code = normalizeRoomCode(req.params.code);
    if (!isValidRoomCode(code)) {
      res.status(400).json({ exists: false, error: 'INVALID_ROOM_CODE' });
      return;
    }
    const word = rooms.get(code);
    const char = characterRooms.get(code);
    const room = word ?? char;
    if (!room) {
      res.status(404).json({ exists: false, error: 'ROOM_NOT_FOUND' });
      return;
    }
    const game: GameKind = word ? 'word' : 'character';
    res.json({ exists: true, game, code, full: room.isFull() });
  });

  // LAN IPv4 addresses — lets the client build an invite link that phones/iPads on the
  // same Wi-Fi can open when the host is browsing via http://localhost during development.
  app.get('/api/network', (_req, res) => {
    const addresses = Object.values(networkInterfaces())
      .flatMap((list) => list ?? [])
      .filter((a) => a.family === 'IPv4' && !a.internal)
      .map((a) => a.address);
    res.json({ addresses });
  });

  if (options.staticDir && existsSync(path.join(options.staticDir, 'index.html'))) {
    const dir = options.staticDir;
    app.use(express.static(dir, { index: false, maxAge: '1h' }));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
      res.sendFile(path.join(dir, 'index.html'));
    });
  }

  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: (origin, cb) => cb(null, !origin || isOriginAllowed(origin, corsOrigins)) },
    pingInterval: 10_000,
    pingTimeout: 8_000,
  });

  registerWordGame(io.of('/'), rooms, wordConfig, isCodeTaken);
  const images =
    options.characterImages ?? (process.env.CHARACTER_IMAGES === 'off' ? noImageLookup : createImageLookup());
  registerCharacterGame(io.of(CHARACTER_NAMESPACE), characterRooms, charConfig, isCodeTaken, images);

  return {
    httpServer,
    io,
    rooms,
    characterRooms,
    close: async () => {
      for (const room of rooms.values()) room.destroy();
      for (const room of characterRooms.values()) room.destroy();
      rooms.clear();
      characterRooms.clear();
      await new Promise<void>((resolve) => io.close(() => resolve()));
    },
  };
}
