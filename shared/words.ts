import { MAX_NAME_LENGTH, MAX_WORD_LENGTH, ROOM_CODE_LENGTH, type ErrorCode } from './types';

/**
 * Strict normalisation: trim both ends + Unicode NFC.
 * Case is preserved, inner spaces are preserved, no fuzzy / synonym logic.
 */
export function normalizeWord(raw: string): string {
  return String(raw ?? '').normalize('NFC').trim();
}

/** Strict Matching — the two words must be the exact same text after normalisation. */
export function isStrictMatch(a: string, b: string): boolean {
  const na = normalizeWord(a);
  const nb = normalizeWord(b);
  return na.length > 0 && na === nb;
}

/** Number of user-perceived characters (Thai combining vowels/tones count with their base). */
export function visibleLength(s: string): number {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const seg = new Intl.Segmenter('th', { granularity: 'grapheme' });
    let n = 0;
    for (const _ of seg.segment(s)) n++;
    return n;
  }
  return [...s].length;
}

export type WordCheck = { ok: true; word: string } | { ok: false; code: ErrorCode; message: string };

/** Validate a word against the player's OWN previously used words. */
export function checkWord(raw: string, ownUsedWords: Iterable<string>): WordCheck {
  const word = normalizeWord(raw);
  if (!word) return { ok: false, code: 'EMPTY_ANSWER', message: 'กรุณาพิมพ์คำก่อนกด Ready' };
  if (visibleLength(word) > MAX_WORD_LENGTH) {
    return { ok: false, code: 'WORD_TOO_LONG', message: `คำยาวเกินไป (ไม่เกิน ${MAX_WORD_LENGTH} ตัวอักษร)` };
  }
  for (const used of ownUsedWords) {
    if (used === word) {
      return { ok: false, code: 'DUPLICATE_WORD', message: `คุณเคยใช้คำว่า "${word}" ไปแล้ว ลองคำอื่นนะ` };
    }
  }
  return { ok: true, word };
}

export function normalizeName(raw: string): string {
  return String(raw ?? '').normalize('NFC').trim().replace(/\s+/g, ' ');
}

export function isValidName(name: string): boolean {
  return name.length > 0 && visibleLength(name) <= MAX_NAME_LENGTH;
}

// Unambiguous alphabet: no 0/O, 1/I/L.
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function normalizeRoomCode(raw: string): string {
  return String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isValidRoomCode(code: string): boolean {
  if (code.length !== ROOM_CODE_LENGTH) return false;
  for (const ch of code) if (!ROOM_CODE_ALPHABET.includes(ch)) return false;
  return true;
}
