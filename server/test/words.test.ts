import { describe, expect, it } from 'vitest';
import { checkWord, isStrictMatch, isValidRoomCode, normalizeRoomCode, normalizeWord } from '../../shared/words';

describe('Strict Matching', () => {
  it.each([
    ['กาแฟ', 'กาแฟ', true],
    ['กาแฟ', 'กาแฟดำ', false],
    ['ไอติม', 'ไอศกรีม', false],
    ['Apple', 'apple', false],
    ['  กาแฟ ', 'กาแฟ', true],
    ['ตอน เช้า', 'ตอนเช้า', false],
    ['', '', false],
  ])('%j vs %j → %s', (a, b, expected) => {
    expect(isStrictMatch(a, b)).toBe(expected);
  });

  it('uses Unicode NFC normalisation', () => {
    const composed = 'é'; // U+00E9
    const decomposed = 'é';
    expect(composed).not.toBe(decomposed);
    expect(isStrictMatch(composed, decomposed)).toBe(true);
    expect(normalizeWord(decomposed)).toBe(composed);
  });
});

describe('checkWord', () => {
  it('rejects empty answers', () => {
    expect(checkWord('   ', [])).toMatchObject({ ok: false, code: 'EMPTY_ANSWER' });
  });
  it('rejects the player’s own duplicates only (strict)', () => {
    expect(checkWord('กาแฟ', ['กาแฟ'])).toMatchObject({ ok: false, code: 'DUPLICATE_WORD' });
    expect(checkWord(' กาแฟ ', ['กาแฟ'])).toMatchObject({ ok: false, code: 'DUPLICATE_WORD' });
    expect(checkWord('กาแฟดำ', ['กาแฟ'])).toMatchObject({ ok: true, word: 'กาแฟดำ' });
  });
  it('rejects overly long words', () => {
    expect(checkWord('ก'.repeat(31), [])).toMatchObject({ ok: false, code: 'WORD_TOO_LONG' });
  });
});

describe('room codes', () => {
  it('normalises and validates', () => {
    expect(normalizeRoomCode(' ab-c23d ')).toBe('ABC23D');
    expect(isValidRoomCode('ABC23D')).toBe(true);
    expect(isValidRoomCode('ABC23')).toBe(false);
    expect(isValidRoomCode('ABC0OI')).toBe(false); // ambiguous characters are never generated
  });
});
