import { describe, expect, it } from 'vitest';
import { isOriginAllowed } from '../src/app';

describe('isOriginAllowed (CLIENT_ORIGIN)', () => {
  it('allows anything when no origins are configured', () => {
    expect(isOriginAllowed('https://anything.example', [])).toBe(true);
  });
  it('matches exact origins (trailing slash tolerated)', () => {
    const list = ['https://matchgame.vercel.app/'];
    expect(isOriginAllowed('https://matchgame.vercel.app', list)).toBe(true);
    expect(isOriginAllowed('https://evil.example', list)).toBe(false);
  });
  it('supports wildcard hosts for preview deployments', () => {
    const list = ['https://*.vercel.app'];
    expect(isOriginAllowed('https://matchgame-git-main-vjjap.vercel.app', list)).toBe(true);
    expect(isOriginAllowed('http://matchgame.vercel.app', list)).toBe(false); // protocol must match
    expect(isOriginAllowed('https://vercel.app.evil.example', list)).toBe(false);
    expect(isOriginAllowed('not a url', list)).toBe(false);
  });
});
