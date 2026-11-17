import type { SessionInfo } from '../../../shared/types';

// Storage can throw (private mode, blocked site data) — never let that break the game.
function get(store: 'local' | 'session', key: string): string | null {
  try {
    return (store === 'local' ? localStorage : sessionStorage).getItem(key);
  } catch {
    return null;
  }
}
function put(store: 'local' | 'session', key: string, value: string | null): void {
  try {
    const s = store === 'local' ? localStorage : sessionStorage;
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
  } catch {
    /* ignore */
  }
}

// The session is per TAB (sessionStorage), so two tabs on one laptop can be two players,
// while a reload in the same tab restores the seat.
const SESSION_KEY = 'kipchom.session';
const NAME_KEY = 'kipchom.name';
const MUTED_KEY = 'kipchom.muted';

export function loadSession(): SessionInfo | null {
  const raw = get('session', SESSION_KEY);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as SessionInfo;
    return s && s.roomCode && s.playerId && s.token ? s : null;
  } catch {
    return null;
  }
}
export function saveSession(s: SessionInfo | null): void {
  put('session', SESSION_KEY, s ? JSON.stringify(s) : null);
}

export const loadName = (): string => get('local', NAME_KEY) ?? '';
export const saveName = (name: string): void => put('local', NAME_KEY, name);

export const loadMuted = (): boolean => get('local', MUTED_KEY) === '1';
export const saveMuted = (m: boolean): void => put('local', MUTED_KEY, m ? '1' : '0');

// MatchCharacter keeps its own per-tab session.
const CHAR_SESSION_KEY = 'kipchom.char.session';

export function loadCharSession(): SessionInfo | null {
  const raw = get('session', CHAR_SESSION_KEY);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as SessionInfo;
    return s && s.roomCode && s.playerId && s.token ? s : null;
  } catch {
    return null;
  }
}
export function saveCharSession(s: SessionInfo | null): void {
  put('session', CHAR_SESSION_KEY, s ? JSON.stringify(s) : null);
}
