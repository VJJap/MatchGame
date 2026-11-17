import { useEffect, useState } from 'react';
import type { GameKind } from '../../../shared/character';
import { serverBase } from './socket';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * Invite link for a room. When the host is browsing via http://localhost during development,
 * swap in the machine's LAN IP so a phone / iPad on the same Wi-Fi can open the link.
 */
export function useInviteLink(roomCode: string, game: GameKind = 'word'): { url: string; lanSwapped: boolean } {
  const base = `${location.origin}${location.pathname}`;
  const [lanBase, setLanBase] = useState<string | null>(null);

  useEffect(() => {
    if (!LOCAL_HOSTS.has(location.hostname)) return;
    let cancelled = false;
    fetch(`${serverBase}/api/network`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { addresses?: string[] } | null) => {
        const ip = data?.addresses?.find((a) => a.startsWith('192.168.') || a.startsWith('10.')) ?? data?.addresses?.[0];
        if (!cancelled && ip) {
          const u = new URL(base);
          u.hostname = ip;
          setLanBase(u.toString());
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [base]);

  const chosen = lanBase ?? base;
  return { url: `${chosen}?game=${game}&room=${roomCode}`, lanSwapped: Boolean(lanBase) };
}

/** Clipboard with a fallback for plain-http LAN pages (no async clipboard there). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function canShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}
