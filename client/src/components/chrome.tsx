import type { ReactNode } from 'react';
import { useClock } from '../lib/hooks';
import { actions, useGame } from '../lib/store';
import { dismissToast, useToasts } from '../lib/toast';
import { IconLogout, IconWifiOff } from './icons';
import { Logo, SoundToggle, cx } from './ui';

// ------------------------------------------------------------------ Top bar

export function GameTopBar({
  logo,
  title,
  shortTitle,
  subtitle,
  roomCode,
  onLeave,
  confirmLeave,
  right,
}: {
  logo: ReactNode;
  title: string;
  shortTitle: string;
  subtitle?: string;
  roomCode?: string | null;
  onLeave: () => void;
  confirmLeave?: boolean;
  right?: ReactNode;
}) {
  const leave = () => {
    if (!confirmLeave || window.confirm('ออกจากห้องนี้? อีกฝ่ายจะได้รับแจ้งว่าคุณออกจากเกม')) onLeave();
  };
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center gap-2 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 sm:gap-3 sm:px-6 sm:pt-5">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {logo}
        <div className="min-w-0 leading-tight text-white">
          {shortTitle ? <p className="truncate font-display text-[15px] font-bold sm:hidden">{shortTitle}</p> : null}
          <p className="hidden truncate font-display text-lg font-bold sm:block">{title}</p>
          {subtitle ? <p className="hidden text-xs text-white/70 sm:block">{subtitle}</p> : null}
        </div>
      </div>
      {right}
      {roomCode ? (
        <div className="flex h-11 items-center rounded-xl bg-white/15 px-3 font-display text-white ring-1 ring-white/25 backdrop-blur">
          <span className="mr-1.5 hidden text-xs text-white/70 min-[400px]:inline">ห้อง</span>
          <span className="font-bold tracking-[0.18em]">{roomCode}</span>
        </div>
      ) : null}
      <SoundToggle />
      <button
        type="button"
        onClick={leave}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white ring-1 ring-white/25 transition hover:bg-white/25"
        aria-label="ออกจากห้อง"
        title="ออกจากห้อง"
      >
        <IconLogout />
      </button>
    </header>
  );
}

/** Match Word's top bar (wired to the Match Word store). */
export function TopBar({ confirmLeave }: { confirmLeave?: boolean }) {
  const { snapshot } = useGame();
  return (
    <GameTopBar
      logo={<Logo className="size-9 shrink-0 drop-shadow sm:size-10" />}
      title="พิมพ์จนกว่าคำจะตรงกัน"
      shortTitle="Match Word"
      subtitle="Type Until We Match"
      roomCode={snapshot?.roomCode}
      onLeave={actions.leave}
      confirmLeave={confirmLeave}
    />
  );
}

// ------------------------------------------------------------------ Toasts

export function Toasts() {
  const toasts = useToasts();
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismissToast(t.id)}
          className={cx(
            'pointer-events-auto max-w-md animate-rise rounded-2xl px-4 py-2.5 text-left text-[15px] font-medium shadow-xl ring-1',
            t.tone === 'success' && 'bg-emerald-50 text-emerald-800 ring-emerald-200',
            t.tone === 'info' && 'bg-white text-slate-800 ring-slate-200',
            t.tone === 'warn' && 'bg-amber-50 text-amber-900 ring-amber-200',
            t.tone === 'error' && 'bg-rose-50 text-rose-800 ring-rose-200',
          )}
        >
          {t.text}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Connection banners

/** Shown when *this* device lost its connection to the server. */
export function ConnectionBanner({ conn, active }: { conn: string; active: boolean }) {
  if (conn === 'connected' || !active) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="flex animate-rise items-center gap-2.5 rounded-2xl bg-slate-900/90 px-4 py-3 text-sm text-white shadow-2xl backdrop-blur">
        <IconWifiOff size={18} className="text-amber-300" />
        <span>{conn === 'connecting' ? 'กำลังเชื่อมต่อเซิร์ฟเวอร์…' : 'การเชื่อมต่อขาดหาย กำลังเชื่อมต่อใหม่…'}</span>
      </div>
    </div>
  );
}

/** Shown when the *opponent* dropped and their seat is being held. */
export function AwayBanner({ name, until, note }: { name: string; until: number | null; note: string }) {
  const now = useClock(500, true);
  const secs = until ? Math.max(0, Math.ceil((until - now) / 1000)) : null;
  return (
    <div className="flex animate-rise items-start gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-amber-900 ring-1 ring-amber-200">
      <IconWifiOff size={20} className="mt-0.5 shrink-0 text-amber-500" />
      <div className="text-sm leading-relaxed">
        <p className="font-semibold">{name} หลุดการเชื่อมต่อ</p>
        <p className="text-amber-800/80">
          รอให้กลับเข้าห้อง{secs !== null ? ` อีก ${secs} วินาที` : ''} — {note}
        </p>
      </div>
    </div>
  );
}

/** Match Word's opponent-away banner. */
export function OpponentAwayBanner() {
  const { snapshot, opponentAwayUntil } = useGame();
  const opp = snapshot?.players.find((p) => p.role !== snapshot.you.role);
  if (!opp || opp.connected) return null;
  return <AwayBanner name={opp.name} until={opponentAwayUntil} note="เวลาของรอบหยุดไว้ชั่วคราว" />;
}

// ------------------------------------------------------------------ Backdrop

const BLOBS: Record<'word' | 'character' | 'picker', [string, string, string]> = {
  word: ['bg-fuchsia-400/30', 'bg-sky-400/30', 'bg-indigo-300/25'],
  character: ['bg-yellow-300/35', 'bg-rose-400/30', 'bg-orange-300/30'],
  picker: ['bg-violet-500/35', 'bg-orange-400/30', 'bg-pink-500/25'],
};

/** Decorative floating blobs behind everything. */
export function Backdrop({ theme = 'word' }: { theme?: 'word' | 'character' | 'picker' }) {
  const [a, b, c] = BLOBS[theme];
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      {theme === 'character' ? <div className="quiz-rays absolute inset-0 opacity-60" /> : null}
      <div className={cx('absolute -top-24 -left-24 size-80 animate-float rounded-full blur-3xl', a)} />
      <div
        className={cx('absolute top-1/3 -right-28 size-96 animate-float rounded-full blur-3xl', b)}
        style={{ animationDelay: '-3s' }}
      />
      <div
        className={cx('absolute -bottom-32 left-1/4 size-96 animate-float rounded-full blur-3xl', c)}
        style={{ animationDelay: '-6s' }}
      />
    </div>
  );
}
