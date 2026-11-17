import { describe, expect, it } from 'vitest';
import { createImageLookup, looseKey, titleMatchScore, wikiNameScore } from '../src/games/character/images';

// ------------------------------------------------------------------ fake APIs

type Page = { title: string; index?: number; thumb?: boolean; disambiguation?: boolean };

const ANILIST: Record<string, unknown[]> = {
  goku: [
    {
      name: { full: 'Gokuu Son', native: '孫悟空' },
      image: { large: 'https://img/anilist/goku.png' },
      siteUrl: 'https://anilist.co/character/246',
      media: {
        nodes: [
          { title: { romaji: 'Dragon Ball Z', english: 'Dragon Ball Z', native: null }, coverImage: { large: 'https://img/dbz.png' }, siteUrl: null },
          { title: { romaji: 'Dragon Ball', english: 'Dragon Ball', native: null }, coverImage: { large: 'https://img/db.png' }, siteUrl: null },
        ],
      },
    },
  ],
  sakura: [
    {
      name: { full: 'Sakura Haruno', native: null },
      image: { large: 'https://img/sakura-naruto.png' },
      siteUrl: 'https://anilist.co/character/145',
      media: { nodes: [{ title: { romaji: 'NARUTO', english: 'Naruto', native: null }, coverImage: { large: 'https://img/naruto.png' }, siteUrl: null }] },
    },
    {
      name: { full: 'Sakura Kinomoto', native: null },
      image: { large: 'https://img/sakura-ccs.png' },
      siteUrl: 'https://anilist.co/character/2671',
      media: {
        nodes: [
          { title: { romaji: 'Cardcaptor Sakura', english: 'Cardcaptor Sakura', native: null }, coverImage: { large: 'https://img/ccs.png' }, siteUrl: null },
        ],
      },
    },
  ],
};

const WIKI: Record<string, Page[]> = {
  'en|iron man the avengers': [
    { title: 'Avengers Disassembled', index: 1, thumb: true },
    { title: 'Iron Man', index: 2, thumb: true },
    { title: 'Iron Man (2008 film)', index: 3, thumb: true },
  ],
  'en|the avengers film': [
    { title: 'The Avengers (2012 film)', index: 1, thumb: true },
    { title: 'Avengers: Age of Ultron', index: 2, thumb: true },
  ],
  'en|thor thor': [
    { title: 'Thor', index: 1, thumb: true },
    { title: 'Thor (film)', index: 2, thumb: true },
    { title: 'Thor (Marvel Comics)', index: 3, thumb: true },
  ],
  'en|thor film': [{ title: 'Thor (film)', index: 1, thumb: true }],
  'en|zzz unknown': [{ title: 'Something Else', index: 1, thumb: true }],
  'en|zzz': [{ title: 'Zzz (disambiguation)', index: 1, thumb: true, disambiguation: true }],
  'en|unknown film': [],
  'en|goku dragon ball': [{ title: 'Goku', index: 1, thumb: true }],
  'th|โคนัน ยอดนักสืบจิ๋วโคนัน': [
    { title: 'โคนัน', index: 1, thumb: false, disambiguation: true },
    { title: 'เอโดงาวะ โคนัน', index: 2, thumb: true },
  ],
  'th|ยอดนักสืบจิ๋วโคนัน': [{ title: 'ยอดนักสืบจิ๋วโคนัน', index: 1, thumb: true }],
};

function fakeFetch(opts: { anilist?: 'ok' | 'empty' | '429'; delayMs?: number } = {}) {
  const calls: string[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (opts.delayMs) {
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, opts.delayMs);
        init?.signal?.addEventListener('abort', () => {
          clearTimeout(t);
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    }
    if (url.includes('anilist')) {
      const search = String(JSON.parse(String(init?.body)).variables.search).toLowerCase();
      calls.push(`anilist|${search}`);
      if (opts.anilist === '429') return new Response('slow down', { status: 429, headers: { 'retry-after': '30' } });
      const characters = opts.anilist === 'empty' ? [] : (ANILIST[search] ?? []);
      return Response.json({ data: { Page: { characters } } });
    }
    const host = new URL(url).host.split('.')[0];
    const q = looseKey(decodeURIComponent(url.match(/gsrsearch=([^&]*)/)![1]));
    calls.push(`${host}|${q}`);
    const pages = (WIKI[`${host}|${q}`] ?? []).map((p) => ({
      title: p.title,
      index: p.index,
      fullurl: `https://${host}.wikipedia.org/wiki/${encodeURIComponent(p.title)}`,
      ...(p.thumb ? { thumbnail: { source: `https://upload/${encodeURIComponent(p.title)}.jpg` } } : {}),
      ...(p.disambiguation ? { pageprops: { disambiguation: '' } } : {}),
    }));
    return Response.json({ query: { pages } });
  }) as typeof fetch;
  return { fn, calls };
}

// ------------------------------------------------------------------ tests

describe('matching helpers', () => {
  it('normalises loosely and keeps Thai vowels / tone marks', () => {
    expect(looseKey('  The  AVENGERS! ')).toBe('the avengers');
    expect(looseKey('โคนัน')).toBe('โคนัน');
    expect(titleMatchScore('Dragon Ball', 'Dragon Ball')).toBe(100);
    expect(titleMatchScore('Dragon Ball', 'Dragon Ball Z')).toBeGreaterThan(0);
    expect(titleMatchScore('Naruto', 'One Piece')).toBe(0);
  });

  it('scores Wikipedia pages: name must be in the title; character pages beat film pages', () => {
    const thumb = { source: 'x' };
    const score = (title: string, ctx: string[] = []) => wikiNameScore('Thor', { title, index: 1, thumbnail: thumb }, ctx);
    expect(score('Thor (Marvel Comics)')).toBeGreaterThan(score('Thor'));
    expect(score('Thor')).toBeGreaterThan(score('Thor (film)'));
    expect(score('Something Else')).toBe(0);
    expect(wikiNameScore('Thor', { title: 'Thor', index: 1 }, [])).toBe(0); // no picture
    expect(
      wikiNameScore('Walter White', { title: 'Walter White (Breaking Bad)', index: 1, thumbnail: thumb }, ['breaking', 'bad']),
    ).toBeGreaterThan(wikiNameScore('Walter White', { title: 'Walter White', index: 2, thumbnail: thumb }, ['breaking', 'bad']));
  });
});

describe('createImageLookup', () => {
  it('anime: AniList portrait + the cover of the title the player named', async () => {
    const { fn } = fakeFetch();
    const r = await createImageLookup({ fetch: fn }).find('anime', 'Goku', 'Dragon Ball');
    expect(r).toMatchObject({
      source: 'anilist',
      characterImage: 'https://img/anilist/goku.png',
      titleImage: 'https://img/db.png', // not the more popular DBZ cover
      matchedName: 'Gokuu Son',
      matchedTitle: 'Dragon Ball',
    });
  });

  it('anime: uses the title to pick between characters with the same name', async () => {
    const { fn } = fakeFetch();
    const r = await createImageLookup({ fetch: fn }).find('anime', 'Sakura', 'Cardcaptor Sakura');
    expect(r).toMatchObject({ matchedName: 'Sakura Kinomoto', characterImage: 'https://img/sakura-ccs.png' });
  });

  it('anime: falls back to Wikipedia when AniList has nothing', async () => {
    const { fn, calls } = fakeFetch({ anilist: 'empty' });
    const r = await createImageLookup({ fetch: fn }).find('anime', 'Goku', 'Dragon Ball');
    expect(r).toMatchObject({ source: 'wikipedia', matchedName: 'Goku' });
    expect(calls[0]).toBe('anilist|goku');
  });

  it('movie: Wikipedia character page + film poster, ignoring a better-ranked unrelated page', async () => {
    const { fn } = fakeFetch();
    const r = await createImageLookup({ fetch: fn }).find('movie', 'Iron Man', 'The Avengers');
    expect(r).toMatchObject({
      source: 'wikipedia',
      matchedName: 'Iron Man',
      matchedTitle: 'The Avengers (2012 film)',
      characterImage: 'https://upload/Iron%20Man.jpg',
    });
  });

  it('prefers the comics character over the myth / the film for "Thor"', async () => {
    const { fn } = fakeFetch();
    const r = await createImageLookup({ fetch: fn }).find('movie', 'Thor', 'Thor');
    expect(r?.matchedName).toBe('Thor (Marvel Comics)');
    expect(r?.matchedTitle).toBe('Thor (film)');
  });

  it('Thai names are looked up on th.wikipedia.org', async () => {
    const { fn, calls } = fakeFetch();
    const r = await createImageLookup({ fetch: fn }).find('anime', 'โคนัน', 'ยอดนักสืบจิ๋วโคนัน');
    expect(calls.every((c) => c.startsWith('th|'))).toBe(true);
    expect(r).toMatchObject({ matchedName: 'เอโดงาวะ โคนัน', matchedTitle: 'ยอดนักสืบจิ๋วโคนัน' });
  });

  it('returns null rather than a wrong picture', async () => {
    const { fn } = fakeFetch();
    expect(await createImageLookup({ fetch: fn }).find('movie', 'Zzz', 'Unknown')).toBeNull();
  });

  it('caches results and shares in-flight lookups', async () => {
    const { fn, calls } = fakeFetch();
    const lookup = createImageLookup({ fetch: fn });
    const [a, b] = await Promise.all([lookup.find('anime', 'Goku', 'Dragon Ball'), lookup.find('anime', ' goku ', 'DRAGON BALL')]);
    expect(a).toEqual(b);
    await lookup.find('anime', 'Goku', 'Dragon Ball');
    expect(calls).toEqual(['anilist|goku']);
  });

  it('backs off after HTTP 429 instead of hammering the source', async () => {
    const { fn, calls } = fakeFetch({ anilist: '429' });
    const lookup = createImageLookup({ fetch: fn });
    await lookup.find('anime', 'Goku', 'Dragon Ball');
    await lookup.find('anime', 'Sakura', 'Naruto');
    expect(calls.filter((c) => c.startsWith('anilist')).length).toBe(1);
  });

  it('gives up within the time budget', async () => {
    const { fn } = fakeFetch({ delayMs: 5000 });
    const t0 = Date.now();
    const r = await createImageLookup({ fetch: fn, timeoutMs: 150 }).find('movie', 'Iron Man', 'The Avengers');
    expect(r).toBeNull();
    expect(Date.now() - t0).toBeLessThan(1500);
  });
});
