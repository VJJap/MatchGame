import { useSyncExternalStore } from 'react';
import type { GameKind } from '../../../shared/character';
import { normalizeRoomCode } from '../../../shared/words';
import { serverBase } from './socket';

// Which screen the site shows: the game picker, or one of the games.
// Kept in the URL (?game=word|character&room=CODE) so invite links and reloads land in the right game.

export type Screen = 'picker' | GameKind;

const SESSION_KEYS: Record<GameKind, string> = { word: 'kipchom.session', character: 'kipchom.char.session' };

function hasSession(game: GameKind): boolean {
  try {
    return Boolean(sessionStorage.getItem(SESSION_KEYS[game]));
  } catch {
    return false;
  }
}

function readGameParam(): GameKind | null {
  const g = new URLSearchParams(location.search).get('game');
  return g === 'word' || g === 'character' ? g : null;
}

function initialScreen(): Screen {
  const g = readGameParam();
  if (g) return g;
  // An old-style invite link (?room= without game) is resolved by resolveRoomParam().
  if (new URLSearchParams(location.search).get('room')) return 'picker';
  if (hasSession('word')) return 'word';
  if (hasSession('character')) return 'character';
  return 'picker';
}

let screen: Screen = initialScreen();
const subs = new Set<() => void>();

function writeUrl(next: Screen, room?: string | null): void {
  const url = new URL(location.href);
  if (next === 'picker') url.searchParams.delete('game');
  else url.searchParams.set('game', next);
  if (room !== undefined) {
    if (room) url.searchParams.set('room', room);
    else url.searchParams.delete('room');
  }
  if (url.href !== location.href) history.replaceState(null, '', url);
}

/** `room`: a code to put in the URL, null to remove it, undefined to keep it (always removed on the picker). */
export function goTo(next: Screen, room?: string | null): void {
  writeUrl(next, room !== undefined ? room : next === 'picker' ? null : undefined);
  if (screen === next) return;
  screen = next;
  document.body.dataset.theme = next;
  subs.forEach((f) => f());
}

export function useScreen(): Screen {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => screen,
  );
}

export type RoomLookup =
  | { ok: true; game: GameKind; code: string; full: boolean }
  | { ok: false; message: string };

/** Ask the server which game a room code belongs to. */
export async function lookupRoom(raw: string): Promise<RoomLookup> {
  const code = normalizeRoomCode(raw);
  try {
    const res = await fetch(`${serverBase}/api/rooms/${encodeURIComponent(code)}`);
    if (res.status === 404) return { ok: false, message: `ไม่พบห้อง ${code} ตรวจสอบรหัสอีกครั้ง` };
    if (!res.ok) return { ok: false, message: 'รหัสห้องไม่ถูกต้อง (ต้องมี 6 ตัวอักษร)' };
    const data = (await res.json()) as { game: GameKind; code: string; full: boolean };
    return { ok: true, game: data.game, code: data.code, full: data.full };
  } catch {
    return { ok: false, message: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง' };
  }
}

/** On load: a ?room= link without ?game= is routed to whichever game owns the code. */
export async function resolveRoomParam(): Promise<RoomLookup | null> {
  const params = new URLSearchParams(location.search);
  const room = params.get('room');
  if (!room || readGameParam()) return null;
  const r = await lookupRoom(room);
  if (r.ok) goTo(r.game, r.code);
  return r;
}

document.body.dataset.theme = screen;

// Holds a live socket / module state: in dev, reload the page instead of hot-swapping (the session restores the seat).
if (import.meta.hot) import.meta.hot.accept(() => window.location.reload());
