// Finds a picture for a MatchCharacter answer.
//   anime          → AniList (character portrait + series cover), Wikipedia as a fallback
//   series / movie → Wikipedia (page image of the character + poster of the title)
// Images are best-effort: every failure, timeout or poor match resolves to null and the game goes on.

import type { Category, CharacterImage } from '../../../../shared/character';
import { characterKey } from '../../../../shared/character';

export interface CharacterImageLookup {
  find(category: Category, character: string, title: string): Promise<CharacterImage | null>;
}

/** Lookup that never finds anything (tests, offline play, CHARACTER_IMAGES=off). */
export const noImageLookup: CharacterImageLookup = { find: async () => null };

export interface ImageLookupOptions {
  fetch?: typeof fetch;
  /** Budget for one lookup, all requests included. */
  timeoutMs?: number;
  cacheTtlMs?: number;
  cacheSize?: number;
}

// Generic client name (Wikipedia asks API clients to identify themselves; no personal details).
const USER_AGENT = 'MatchGame/1.0 (two-player party game; character image lookup)';
const ANILIST_URL = 'https://graphql.anilist.co';
const THAI = /[฀-๿]/;

const ANILIST_QUERY = `query ($search: String) {
  Page(perPage: 5) {
    characters(search: $search) {
      name { full native }
      image { large }
      siteUrl
      media(perPage: 8, sort: POPULARITY_DESC) {
        nodes { title { romaji english native } coverImage { large } siteUrl }
      }
    }
  }
}`;

interface AniTitle {
  romaji: string | null;
  english: string | null;
  native: string | null;
}
interface AniMedia {
  title: AniTitle;
  coverImage: { large: string | null } | null;
  siteUrl: string | null;
}
interface AniCharacter {
  name: { full: string | null; native: string | null };
  image: { large: string | null } | null;
  siteUrl: string | null;
  media: { nodes: AniMedia[] } | null;
}

interface WikiPage {
  title: string;
  index?: number;
  thumbnail?: { source: string };
  pageprops?: { disambiguation?: string };
  fullurl?: string;
}

/** Lowercase, no punctuation, single spaces — for comparing names and titles. */
export function looseKey(s: string): string {
  return characterKey(s)
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ') // keep \p{M}: Thai vowels / tone marks
    .replace(/\s+/g, ' ')
    .trim();
}

/** How well a media / page title matches the title the player typed (0 = not at all). */
export function titleMatchScore(typed: string, candidate: string | null | undefined): number {
  if (!candidate) return 0;
  const a = looseKey(typed);
  const b = looseKey(candidate);
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (b.startsWith(a) || a.startsWith(b)) return 60;
  if (b.includes(a) || a.includes(b)) return 40;
  return 0;
}

const NOISE = /^(list of|lists of|รายชื่อ)|\bseason \d|\bepisodes?\b|\bfilmography\b|\bsoundtrack\b|\bin other media\b|\bcast\b/i;
/** Parentheticals that mark a page about a fictional character. */
const FICTION = ['character', 'comics', 'marvel', 'dc', 'universe', 'franchise', 'manga', 'anime', 'ตัวละคร'];
/** Parentheticals that mark a page about a work, not a character. */
const WORK = /\b(film|movie|tv series|series|season|novel|album|song|band|video game|game|play|musical)\b|\b(19|20)\d\d\b|ภาพยนตร์|ละคร/;

/**
 * Score a Wikipedia page as the page about `name` (0 = rejected: no picture, disambiguation, or name not in the title).
 * mode "character": prefers "Thor (Marvel Comics)" / "Walter White (Breaking Bad)" over "Thor (film)".
 * mode "title": prefers "The Avengers (2012 film)" for a movie, "Sherlock (TV series)" for a series.
 */
export function wikiNameScore(
  name: string,
  page: WikiPage,
  contextWords: string[],
  mode: 'character' | 'title' = 'character',
): number {
  if (!page.thumbnail?.source || page.pageprops?.disambiguation !== undefined) return 0;
  const full = looseKey(page.title);
  const base = looseKey(page.title.replace(/\s*\(.*\)\s*$/, ''));
  const paren = looseKey(page.title.match(/\(([^)]*)\)\s*$/)?.[1] ?? '');
  const key = looseKey(name);
  if (!key) return 0;
  let s = 0;
  if (base === key) s = 100;
  else if (base.startsWith(`${key} `) || key.startsWith(`${base} `)) s = 45;
  else if (full.includes(key)) s = 30;
  else return 0;
  const hasContext = contextWords.some((w) => w.length > 2 && paren.includes(w));
  if (paren) {
    if (mode === 'character') {
      if (hasContext || FICTION.some((w) => paren.includes(w))) s += 25;
      else if (WORK.test(paren)) s -= 40;
    } else if (hasContext) s += 25;
  }
  if (NOISE.test(page.title)) s -= 60;
  s -= (page.index ?? 10) * 0.5; // small preference for the search engine's own ranking
  return s;
}

/** Limits concurrent requests per host and backs off after HTTP 429. */
class HostGate {
  private active = 0;
  private queue: (() => void)[] = [];
  private coolUntil = 0;
  constructor(private readonly max: number) {}
  get coolingDown(): boolean {
    return Date.now() < this.coolUntil;
  }
  backOff(seconds: number): void {
    this.coolUntil = Math.max(this.coolUntil, Date.now() + Math.min(Math.max(seconds, 5), 120) * 1000);
  }
  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) await new Promise<void>((r) => this.queue.push(r));
    this.active++;
    try {
      return await task();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}

export function createImageLookup(options: ImageLookupOptions = {}): CharacterImageLookup {
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 2500;
  const ttl = options.cacheTtlMs ?? 6 * 60 * 60 * 1000;
  const maxSize = options.cacheSize ?? 500;
  const cache = new Map<string, { value: CharacterImage | null; expires: number }>();
  const inFlight = new Map<string, Promise<CharacterImage | null>>();
  const gates = new Map<string, HostGate>();
  const gateFor = (url: string) => {
    const host = new URL(url).host;
    let g = gates.get(host);
    if (!g) gates.set(host, (g = new HostGate(2)));
    return g;
  };

  async function getJson<T>(url: string, signal: AbortSignal, init?: RequestInit): Promise<T | null> {
    const gate = gateFor(url);
    if (gate.coolingDown) return null; // the source asked us to slow down — skip it for now
    return gate.run(async () => {
      if (signal.aborted) return null; // out of time budget (also skips requests that waited in the queue)
      try {
        const res = await doFetch(url, {
          ...init,
          signal,
          headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...(init?.headers ?? {}) },
        });
        if (res.status === 429) {
          gate.backOff(Number(res.headers.get('retry-after')) || 30);
          return null;
        }
        if (!res.ok) return null;
        return (await res.json()) as T;
      } catch {
        return null;
      }
    });
  }

  // ---------------------------------------------------------------- AniList

  async function fromAniList(character: string, title: string, signal: AbortSignal): Promise<CharacterImage | null> {
    const data = await getJson<{ data?: { Page?: { characters?: AniCharacter[] } } }>(ANILIST_URL, signal, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: ANILIST_QUERY, variables: { search: character } }),
    });
    const chars = data?.data?.Page?.characters ?? [];
    if (!chars.length) return null;

    // Prefer the search result that appears in the title the player named.
    let best: { c: AniCharacter; m: AniMedia | null; score: number } | null = null;
    chars.forEach((c, i) => {
      const media = c.media?.nodes ?? [];
      let m: AniMedia | null = null;
      let ms = 0;
      for (const node of media) {
        const sc = Math.max(
          titleMatchScore(title, node.title.english),
          titleMatchScore(title, node.title.romaji),
          titleMatchScore(title, node.title.native),
        );
        if (sc > ms) {
          ms = sc;
          m = node;
        }
      }
      const score = ms - i * 5; // AniList's own ranking breaks ties
      if (!best || score > best.score) best = { c, m: m ?? media[0] ?? null, score };
    });
    if (!best) return null;
    const { c, m } = best as { c: AniCharacter; m: AniMedia | null };
    const characterImage = c.image?.large && !c.image.large.includes('/default.') ? c.image.large : null;
    const titleImage = m?.coverImage?.large ?? null;
    if (!characterImage && !titleImage) return null;
    return {
      characterImage,
      titleImage,
      source: 'anilist',
      matchedName: c.name.full ?? c.name.native,
      matchedTitle: m ? (m.title.english ?? m.title.romaji ?? m.title.native) : null,
      link: c.siteUrl ?? m?.siteUrl ?? null,
    };
  }

  // ---------------------------------------------------------------- Wikipedia

  async function wikiSearch(lang: string, query: string, signal: AbortSignal): Promise<WikiPage[]> {
    const url =
      `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&formatversion=2` +
      `&generator=search&gsrlimit=6&gsrsearch=${encodeURIComponent(query)}` +
      `&prop=pageimages%7Cpageprops%7Cinfo&piprop=thumbnail&pithumbsize=480&pilicense=any` +
      `&ppprop=disambiguation&inprop=url`;
    const data = await getJson<{ query?: { pages?: WikiPage[] } }>(url, signal);
    return data?.query?.pages ?? [];
  }

  function bestPage(name: string, pages: WikiPage[], context: string[], mode: 'character' | 'title'): WikiPage | null {
    let best: WikiPage | null = null;
    let bestScore = 0;
    for (const p of pages) {
      const s = wikiNameScore(name, p, context, mode);
      if (s > bestScore) {
        bestScore = s;
        best = p;
      }
    }
    return bestScore >= 25 ? best : null;
  }

  async function fromWikipedia(
    category: Category,
    character: string,
    title: string,
    signal: AbortSignal,
  ): Promise<CharacterImage | null> {
    const charLang = THAI.test(character) ? 'th' : 'en';
    const titleLang = THAI.test(title) ? 'th' : 'en';
    const kind = category === 'movie' ? 'film' : category === 'series' ? 'TV series' : 'anime';
    const titleWords = looseKey(title).split(' ');
    const kindWords = looseKey(kind).split(' ').concat(category === 'series' ? ['series', 'tv'] : [], ['film', 'anime']);

    const findCharacterPage = async () => {
      const withTitle = await wikiSearch(charLang, `${character} ${title}`, signal);
      const page = bestPage(character, withTitle, titleWords, 'character');
      if (page) return page;
      return bestPage(character, await wikiSearch(charLang, character, signal), titleWords, 'character');
    };
    const [charPage, titlePage] = await Promise.all([
      findCharacterPage(),
      wikiSearch(titleLang, titleLang === 'en' ? `${title} ${kind}` : title, signal).then((pages) =>
        bestPage(title, pages, kindWords, 'title'),
      ),
    ]);
    // Don't show the same picture twice (e.g. the character and the film share a page).
    const titleImage =
      titlePage?.thumbnail?.source && titlePage.thumbnail.source !== charPage?.thumbnail?.source
        ? titlePage.thumbnail.source
        : null;
    const characterImage = charPage?.thumbnail?.source ?? null;
    if (!characterImage && !titleImage) return null;
    return {
      characterImage,
      titleImage,
      source: 'wikipedia',
      matchedName: charPage?.title ?? null,
      matchedTitle: titlePage?.title ?? null,
      link: charPage?.fullurl ?? titlePage?.fullurl ?? null,
    };
  }

  // ---------------------------------------------------------------- public

  async function lookup(category: Category, character: string, title: string): Promise<CharacterImage | null> {
    const signal = AbortSignal.timeout(timeoutMs);
    if (category === 'anime' && !THAI.test(character)) {
      const a = await fromAniList(character, title, signal);
      if (a?.characterImage) return a;
      const w = await fromWikipedia(category, character, title, signal);
      return w ?? a;
    }
    return fromWikipedia(category, character, title, signal);
  }

  return {
    find(category, character, title) {
      const key = `${category}|${looseKey(character)}|${looseKey(title)}`;
      const hit = cache.get(key);
      if (hit && hit.expires > Date.now()) return Promise.resolve(hit.value);
      const running = inFlight.get(key);
      if (running) return running;
      const p = lookup(category, character, title)
        .catch(() => null)
        .then((value) => {
          inFlight.delete(key);
          // Cache misses for a shorter time — the source may simply have been slow.
          cache.set(key, { value, expires: Date.now() + (value ? ttl : Math.min(ttl, 10 * 60 * 1000)) });
          if (cache.size > maxSize) cache.delete(cache.keys().next().value as string);
          return value;
        });
      inFlight.set(key, p);
      return p;
    },
  };
}
