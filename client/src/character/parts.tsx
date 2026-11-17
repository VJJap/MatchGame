import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ANSWER_TIME_OPTIONS,
  CATEGORIES,
  CATEGORY_INFO,
  TARGET_SCORES,
  type AnswerSeconds,
  type Category,
  type CharPublicPlayer,
  type CharRoundSummary,
  type CharSnapshot,
  type TargetScore,
  type UsedCharacter,
} from '../../../shared/character';
import type { PlayerRole } from '../../../shared/types';
import { AwayBanner, GameTopBar } from '../components/chrome';
import { IconCheck, IconCopy, IconLink, IconShare, IconWifiOff } from '../components/icons';
import { Button, Card, ThinkingDots, cx } from '../components/ui';
import { useNow } from '../lib/hooks';
import { canShare, copyText, useInviteLink } from '../lib/invite';
import { sfx } from '../lib/sound';
import { toast } from '../lib/toast';
import { charActions, useChar } from './store';

// ------------------------------------------------------------------ Identity

/** Player colours in MatchCharacter: A = orange team, B = violet team. */
export const CROLE: Record<PlayerRole, { grad: string; soft: string; text: string; ring: string; solid: string }> = {
  A: {
    grad: 'from-orange-400 to-amber-500',
    soft: 'bg-orange-50',
    text: 'text-orange-700',
    ring: 'ring-orange-200',
    solid: 'bg-orange-500',
  },
  B: {
    grad: 'from-violet-500 to-fuchsia-500',
    soft: 'bg-violet-50',
    text: 'text-violet-700',
    ring: 'ring-violet-200',
    solid: 'bg-violet-500',
  },
};

export function CharLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="mc-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fb923c" />
          <stop offset="1" stopColor="#db2777" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#mc-bg)" />
      <circle cx="27" cy="27" r="10" fill="#fff" />
      <path d="M10 54c0-10 7.6-16 17-16s17 6 17 16z" fill="#fff" />
      <circle cx="46" cy="19" r="11" fill="#facc15" stroke="#fff" strokeWidth="2.5" />
      <path
        d="M42.6 16.4a3.6 3.6 0 1 1 5.2 3.2c-1.1.6-1.8 1.3-1.8 2.6v.6"
        fill="none"
        stroke="#9d174d"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      <circle cx="46" cy="26.4" r="1.7" fill="#9d174d" />
    </svg>
  );
}

function initial(name: string): string {
  const chars = [...name.trim()];
  if (!chars.length) return '?';
  if ('เแโใไ'.includes(chars[0]) && chars[1]) return chars[0] + chars[1];
  return chars[0].toUpperCase();
}

export function CAvatar({ name, role, size = 'md' }: { name: string; role: PlayerRole; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-linear-to-br font-display font-black text-white shadow-md ring-2 ring-white',
        CROLE[role].grad,
        size === 'sm' && 'size-8 text-sm',
        size === 'md' && 'size-10 text-base',
        size === 'lg' && 'size-12 text-lg sm:size-14 sm:text-xl',
        size === 'xl' && 'size-20 text-3xl sm:size-24 sm:text-4xl',
      )}
      aria-hidden="true"
    >
      {initial(name)}
    </span>
  );
}

export function CategoryBadge({ category, tone = 'light' }: { category: Category; tone?: 'light' | 'dark' }) {
  const c = CATEGORY_INFO[category];
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-display text-sm font-bold',
        tone === 'light' ? 'bg-white/20 text-white ring-1 ring-white/30' : 'bg-rose-50 text-rose-700 ring-1 ring-rose-100',
      )}
    >
      <span aria-hidden="true">{c.emoji}</span> {c.th}
    </span>
  );
}

export function CharTopBar({ confirmLeave }: { confirmLeave?: boolean }) {
  const { snapshot } = useChar();
  return (
    <GameTopBar
      logo={<CharLogo className="size-9 shrink-0 drop-shadow sm:size-10" />}
      title="MatchCharacter"
      shortTitle=""
      subtitle="ทายตัวละครจากลักษณะเด่น"
      roomCode={snapshot?.roomCode}
      onLeave={charActions.leave}
      confirmLeave={confirmLeave}
      right={
        snapshot && snapshot.phase !== 'WAITING_FOR_PLAYERS' && snapshot.phase !== 'LOBBY' ? (
          <span className="hidden md:inline-flex">
            <CategoryBadge category={snapshot.settings.category} />
          </span>
        ) : null
      }
    />
  );
}

export function CharAwayBanner() {
  const { snapshot, opponentAwayUntil } = useChar();
  const opp = snapshot?.players.find((p) => p.role !== snapshot.you.role);
  if (!opp || opp.connected) return null;
  return <AwayBanner name={opp.name} until={opponentAwayUntil} note="เวลาหยุดไว้จนกว่าจะกลับมา" />;
}

// ------------------------------------------------------------------ Scoreboard

export function Scoreboard({ snapshot }: { snapshot: CharSnapshot }) {
  const A = snapshot.players.find((p) => p.role === 'A');
  const B = snapshot.players.find((p) => p.role === 'B');
  const target = snapshot.settings.targetScore;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-3xl bg-white/95 p-3 shadow-[0_18px_40px_-18px_rgba(136,19,55,0.55)] ring-1 ring-white/70 sm:gap-4 sm:p-4">
      {A ? <PlayerScore p={A} target={target} isYou={A.id === snapshot.you.id} align="left" /> : <span />}
      <div className="flex flex-col items-center px-1 text-center leading-none">
        <span className="font-display text-xs font-bold tracking-wide text-rose-400">VS</span>
        <span className="mt-1.5 text-[10px] text-slate-400">เป้าหมาย</span>
        <span className="font-display text-lg font-black text-slate-700">{target}</span>
      </div>
      {B ? <PlayerScore p={B} target={target} isYou={B.id === snapshot.you.id} align="right" /> : <span />}
    </div>
  );
}

function PlayerScore({
  p,
  target,
  isYou,
  align,
}: {
  p: CharPublicPlayer;
  target: number;
  isYou: boolean;
  align: 'left' | 'right';
}) {
  return (
    <div className={cx('flex min-w-0 items-center gap-2 sm:gap-3', align === 'right' && 'flex-row-reverse text-right')}>
      <div className="relative">
        <CAvatar name={p.name} role={p.role} size="md" />
        {!p.connected ? (
          <span className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full bg-amber-400 text-white ring-2 ring-white">
            <IconWifiOff size={11} />
          </span>
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-700">
          {p.name}
          {isYou ? <span className="font-normal text-slate-400"> (คุณ)</span> : null}
        </p>
        <div className={cx('mt-1 flex flex-wrap gap-1', align === 'right' && 'justify-end')} aria-hidden="true">
          {Array.from({ length: target }, (_, i) => (
            <span key={i} className={cx('h-1.5 w-3 rounded-full sm:w-4', i < p.score ? CROLE[p.role].solid : 'bg-slate-200')} />
          ))}
        </div>
      </div>
      <span
        key={p.score}
        className={cx('animate-score font-display text-4xl leading-none font-black tabular-nums sm:text-5xl', CROLE[p.role].text)}
        aria-label={`${p.name} ${p.score} แต้ม`}
      >
        {p.score}
      </span>
    </div>
  );
}

// ------------------------------------------------------------------ Timer bar

export function TimerBar({ snapshot, receivedAt }: { snapshot: CharSnapshot; receivedAt: number }) {
  const t = snapshot.timer;
  const running = Boolean(t && !t.paused);
  const now = useNow(100, running);
  if (!t) {
    return snapshot.settings.answerSeconds === 0 ? (
      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">ไม่จับเวลา</span>
    ) : null;
  }
  const remaining = t.paused ? t.remainingMs : Math.max(0, t.remainingMs - (now - receivedAt));
  const frac = t.totalMs ? remaining / t.totalMs : 0;
  const secs = Math.ceil(remaining / 1000);
  const color = t.paused ? 'bg-slate-300' : frac > 0.5 ? 'bg-emerald-500' : frac > 0.2 ? 'bg-amber-400' : 'bg-rose-500';
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5" role="timer" aria-label={t.paused ? 'หยุดเวลา' : `เหลือ ${secs} วินาที`}>
      <div className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cx('h-full rounded-full transition-[width] duration-150 ease-linear', color)}
          style={{ width: `${Math.max(0, Math.min(1, frac)) * 100}%` }}
        />
      </div>
      <span
        className={cx(
          'w-12 shrink-0 text-right font-display text-lg font-black tabular-nums',
          t.paused ? 'text-slate-400' : frac <= 0.2 ? 'animate-tick text-rose-600' : 'text-slate-700',
        )}
      >
        {t.paused ? '⏸' : `${secs}s`}
      </span>
    </div>
  );
}

// ------------------------------------------------------------------ Clues

export function ClueCard({
  clue,
  role,
  owner,
  delay = 0,
  flip = false,
  size = 'md',
}: {
  clue: string;
  role: PlayerRole;
  owner: string;
  delay?: number;
  flip?: boolean;
  size?: 'md' | 'lg';
}) {
  return (
    <div
      className={cx(
        'relative flex min-w-0 flex-col items-center justify-center rounded-3xl px-3 text-center ring-2',
        CROLE[role].soft,
        CROLE[role].ring,
        size === 'lg' ? 'min-h-32 py-5 sm:min-h-40' : 'min-h-24 py-4 sm:min-h-28',
        flip && 'animate-flip-in',
      )}
      style={flip ? { animationDelay: `${delay}ms` } : undefined}
    >
      <span
        className={cx(
          'absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap text-white shadow',
          CROLE[role].solid,
        )}
      >
        ใบ้จาก {owner}
      </span>
      <span
        className={cx(
          'font-display leading-tight font-black wrap-anywhere',
          CROLE[role].text,
          size === 'lg' ? 'text-2xl sm:text-4xl lg:text-5xl' : 'text-xl sm:text-3xl',
        )}
      >
        {clue}
      </span>
    </div>
  );
}

export function CluePair({ snapshot, flip, size }: { snapshot: CharSnapshot; flip?: boolean; size?: 'md' | 'lg' }) {
  if (!snapshot.clues) return null;
  const nameOf = (r: PlayerRole) => snapshot.players.find((p) => p.role === r)?.name ?? r;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 pt-3 sm:gap-3">
      <ClueCard clue={snapshot.clues.A} role="A" owner={nameOf('A')} flip={flip} size={size} />
      <span className="flex size-9 items-center justify-center rounded-full bg-white font-display text-xl font-black text-rose-500 shadow-md ring-1 ring-rose-100 sm:size-11">
        +
      </span>
      <ClueCard clue={snapshot.clues.B} role="B" owner={nameOf('B')} flip={flip} delay={140} size={size} />
    </div>
  );
}

// ------------------------------------------------------------------ Overlays

export function ClueCountdownOverlay({ snapshot, receivedAt }: { snapshot: CharSnapshot; receivedAt: number }) {
  const active = snapshot.phase === 'CLUE_COUNTDOWN' && snapshot.countdownRemainingMs !== null;
  const now = useNow(50, active);
  const lastN = useRef<number | null>(null);
  const remaining = active ? Math.max(0, snapshot.countdownRemainingMs! - (now - receivedAt)) : 0;
  const n = Math.max(1, Math.ceil(remaining / 1000));
  useEffect(() => {
    if (!active) {
      lastN.current = null;
      return;
    }
    if (lastN.current !== n) {
      lastN.current = n;
      sfx.tick();
    }
  }, [active, n]);
  if (!active) return null;
  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center overflow-hidden bg-rose-950/55 px-6 backdrop-blur-sm">
      <div className="quiz-rays absolute" />
      <p className="relative mb-6 animate-rise font-display text-lg font-bold text-white sm:text-xl">เปิดใบ้ใน…</p>
      <div className="relative flex size-40 items-center justify-center rounded-full bg-yellow-300 shadow-[0_0_0_10px_rgba(255,255,255,0.25)] sm:size-52">
        <span key={n} className="animate-count font-display text-8xl font-black text-rose-600 sm:text-9xl">
          {n}
        </span>
      </div>
    </div>
  );
}

/** Full screen "A ได้คำตอบแล้ว!!" while the answer is being opened. */
export function BuzzOverlay({ snapshot }: { snapshot: CharSnapshot }) {
  if (snapshot.phase !== 'BUZZED' || !snapshot.pending) return null;
  const by = snapshot.pending.by;
  const p = snapshot.players.find((x) => x.role === by);
  const isMe = by === snapshot.you.role;
  return (
    <div
      className="fixed inset-0 z-40 flex flex-col items-center justify-center overflow-hidden bg-linear-to-br from-orange-500 via-rose-500 to-fuchsia-600 px-6 text-center"
      role="alert"
    >
      <div className="quiz-rays absolute" />
      <span className="absolute size-72 animate-burst rounded-full border-8 border-white/40" />
      <span className="absolute size-72 animate-burst rounded-full border-8 border-yellow-200/40" style={{ animationDelay: '0.4s' }} />
      <div className="relative animate-buzz-in">
        <CAvatar name={p?.name ?? by} role={by} size="xl" />
      </div>
      <h2 className="relative mt-6 animate-buzz-in font-display text-4xl leading-tight font-black text-white drop-shadow-[0_6px_0_rgba(136,19,55,0.45)] sm:text-6xl lg:text-7xl">
        {isMe ? 'คุณ' : p?.name} ได้คำตอบแล้ว!!
      </h2>
      <p className="relative mt-4 flex items-center gap-2 font-display text-lg font-semibold text-white/90">
        กำลังเปิดคำตอบ <ThinkingDots />
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ Settings pickers

function Chips<T extends string | number>({
  options,
  value,
  onChange,
  disabled,
  render,
  cols,
  label,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
  render: (v: T, active: boolean) => ReactNode;
  cols: string;
  label: string;
}) {
  return (
    <div className={cx('grid gap-1.5 sm:gap-2', cols)} role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const active = o === value;
        return (
          <button
            key={String(o)}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(o)}
            className={cx(
              'flex flex-col items-center justify-center rounded-2xl font-display leading-tight transition disabled:cursor-not-allowed',
              active
                ? 'bg-linear-to-br from-orange-500 to-rose-500 text-white shadow-lg shadow-rose-500/30'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:hover:bg-slate-100',
              disabled && !active && 'opacity-50',
            )}
          >
            {render(o, active)}
          </button>
        );
      })}
    </div>
  );
}

export function CategoryPicker({ value, onChange, disabled }: { value: Category; onChange: (c: Category) => void; disabled?: boolean }) {
  return (
    <Chips
      label="หมวดหมู่"
      options={CATEGORIES}
      value={value}
      onChange={onChange}
      disabled={disabled}
      cols="grid-cols-3"
      render={(c, active) => (
        <span className="flex h-20 flex-col items-center justify-center gap-1 sm:h-24">
          <span className="text-3xl sm:text-4xl" aria-hidden="true">
            {CATEGORY_INFO[c].emoji}
          </span>
          <span className="text-[15px] font-bold">{CATEGORY_INFO[c].th}</span>
          <span className={cx('text-[10px]', active ? 'text-white/80' : 'text-slate-400')}>{CATEGORY_INFO[c].en}</span>
        </span>
      )}
    />
  );
}

export function TargetPicker({ value, onChange, disabled }: { value: TargetScore; onChange: (t: TargetScore) => void; disabled?: boolean }) {
  return (
    <Chips
      label="แต้มเป้าหมาย"
      options={TARGET_SCORES}
      value={value}
      onChange={onChange}
      disabled={disabled}
      cols="grid-cols-3"
      render={(t, active) => (
        <span className="flex h-14 flex-col items-center justify-center">
          <span className="text-xl font-black">{t}</span>
          <span className={cx('text-[10px]', active ? 'text-white/80' : 'text-slate-400')}>แต้ม</span>
        </span>
      )}
    />
  );
}

export function AnswerTimePicker({
  value,
  onChange,
  disabled,
}: {
  value: AnswerSeconds;
  onChange: (t: AnswerSeconds) => void;
  disabled?: boolean;
}) {
  return (
    <Chips
      label="เวลาหาคำตอบ"
      options={ANSWER_TIME_OPTIONS}
      value={value}
      onChange={onChange}
      disabled={disabled}
      cols="grid-cols-5"
      render={(t, active) => (
        <span className="flex h-14 flex-col items-center justify-center">
          <span className={cx('font-black', t === 0 ? 'text-xl' : 'text-lg')}>{t === 0 ? '∞' : t}</span>
          <span className={cx('text-[10px]', active ? 'text-white/80' : 'text-slate-400')}>
            {t === 0 ? 'ไม่จับเวลา' : 'วินาที'}
          </span>
        </span>
      )}
    />
  );
}

// ------------------------------------------------------------------ Invite

export function CharInviteCard({ roomCode, waiting }: { roomCode: string; waiting: boolean }) {
  const { url, lanSwapped } = useInviteLink(roomCode, 'character');
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const copy = async (what: 'code' | 'link') => {
    if (await copyText(what === 'code' ? roomCode : url)) {
      setCopied(what);
      setTimeout(() => setCopied(null), 1800);
    } else toast('คัดลอกไม่สำเร็จ ลองกดค้างที่ลิงก์เพื่อคัดลอก', 'warn');
  };
  const share = () => {
    navigator
      .share({ title: 'มาเล่น MatchCharacter กัน!', text: `รหัสห้อง ${roomCode}`, url })
      .catch(() => undefined);
  };
  return (
    <Card className="relative overflow-hidden">
      <div className="pointer-events-none absolute -top-16 -right-16 size-48 rounded-full bg-linear-to-br from-yellow-200/70 to-rose-200/70 blur-2xl" />
      <p className="relative text-sm font-semibold text-slate-500">{waiting ? 'ชวนเพื่อนเข้าห้อง' : 'รหัสห้อง'}</p>
      <button type="button" onClick={() => copy('code')} className="relative mt-1 flex items-center gap-3 text-left" title="คัดลอกรหัสห้อง">
        <span className="bg-linear-to-r from-orange-500 to-fuchsia-600 bg-clip-text font-display text-5xl font-black tracking-[0.12em] text-transparent sm:text-6xl">
          {roomCode}
        </span>
        <span className="flex size-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
          {copied === 'code' ? <IconCheck size={18} /> : <IconCopy size={18} />}
        </span>
      </button>
      <div className="relative mt-4">
        <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <IconLink size={16} className="text-rose-500" /> Invite Link
        </p>
        <div className="flex items-center gap-2 rounded-2xl bg-slate-50 p-1.5 pl-3.5 ring-1 ring-slate-200">
          <span className="min-w-0 flex-1 truncate text-sm text-slate-600 select-all">{url}</span>
          <Button size="md" variant="pop" onClick={() => copy('link')} className="shrink-0">
            {copied === 'link' ? <IconCheck size={18} /> : <IconCopy size={18} />}
            {copied === 'link' ? 'คัดลอกแล้ว' : 'Copy Link'}
          </Button>
        </div>
        {canShare() ? (
          <Button variant="popSoft" size="md" className="mt-2 w-full" onClick={share}>
            <IconShare size={18} /> แชร์ลิงก์
          </Button>
        ) : null}
        {lanSwapped ? (
          <p className="mt-2 text-xs leading-relaxed text-slate-400">
            ลิงก์นี้ใช้ IP ในวง Wi-Fi เดียวกัน — มือถือ/iPad ที่ต่อ Wi-Fi เดียวกันเปิดได้เลย
          </p>
        ) : null}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ History & used characters

export function RoundHistory({ snapshot, max }: { snapshot: CharSnapshot; max?: number }) {
  const nameOf = (r: PlayerRole) => snapshot.players.find((p) => p.role === r)?.name ?? r;
  const rows = [...snapshot.history].reverse().slice(0, max);
  if (!rows.length) {
    return <p className="rounded-2xl bg-slate-50 px-4 py-5 text-center text-sm text-slate-400">ยังไม่มีรอบที่จบ</p>;
  }
  return (
    <ol className="space-y-2">
      {rows.map((h) => (
        <HistoryRow key={h.round} h={h} nameOf={nameOf} />
      ))}
    </ol>
  );
}

function HistoryRow({ h, nameOf }: { h: CharRoundSummary; nameOf: (r: PlayerRole) => string }) {
  const o = h.outcome;
  return (
    <li className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-100">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold text-slate-400">รอบที่ {h.round}</span>
        {o.type === 'scored' ? (
          <span className={cx('rounded-full px-2 py-0.5 text-[11px] font-bold text-white', CROLE[o.by].solid)}>
            +1 {nameOf(o.by)}
          </span>
        ) : (
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-500">
            {o.type === 'timeout' ? '⏰ หมดเวลา' : '⏭ ข้ามรอบ'}
          </span>
        )}
      </div>
      <p className="mt-1.5 text-xs text-slate-500">
        <span className="font-semibold text-orange-600">{h.clues.A}</span> +{' '}
        <span className="font-semibold text-violet-600">{h.clues.B}</span>
      </p>
      {o.type === 'scored' ? (
        <p className="mt-1 font-display text-[15px] font-bold text-slate-800">
          {o.character} <span className="font-sans text-xs font-normal text-slate-400">· {o.title}</span>
        </p>
      ) : null}
    </li>
  );
}

export function UsedCharacters({ used }: { used: UsedCharacter[] }) {
  if (!used.length) return <p className="text-sm text-slate-400">ยังไม่มี</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {used.map((u) => (
        <span
          key={`${u.round}-${u.character}`}
          className={cx('rounded-xl px-2.5 py-1 text-sm font-medium ring-1', CROLE[u.by].soft, CROLE[u.by].text, CROLE[u.by].ring)}
          title={u.title}
        >
          {u.character}
        </span>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Rules

export function CharRules({ snapshot }: { snapshot?: Pick<CharSnapshot, 'settings'> }) {
  const s = snapshot?.settings;
  const steps: [string, string][] = [
    ['ใบ้', 'ต่างคนพิมพ์ลักษณะเด่นของตัวละคร 1 อย่างแบบลับ แล้วกด Ready → นับ 3-2-1 เปิดพร้อมกัน'],
    ['แข่งตอบ', 'หาตัวละครที่มีทั้งสองอย่าง พิมพ์ชื่อตัวละคร + ชื่อเรื่อง ใครกด “ตอบ!” ก่อนได้สิทธิ์'],
    ['ตัดสิน', 'อีกฝ่ายกด Agree = ได้ +1 แต้ม · Disagree = แก้คำตอบได้ และแข่งตอบต่อด้วยใบ้เดิม'],
    ['ชนะ', `ใครถึง ${s?.targetScore ?? 'แต้มเป้าหมาย'} แต้มก่อนชนะ`],
  ];
  return (
    <div className="space-y-4">
      <ol className="space-y-2.5">
        {steps.map(([t, d], i) => (
          <li key={t} className="flex gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-rose-100 font-display text-sm font-black text-rose-600">
              {i + 1}
            </span>
            <p className="text-sm leading-relaxed text-slate-600 sm:text-[15px]">
              <span className="font-semibold text-slate-800">{t}:</span> {d}
            </p>
          </li>
        ))}
      </ol>
      <div className="rounded-2xl bg-amber-50 p-3.5 ring-1 ring-amber-100">
        <p className="mb-1.5 font-display text-sm font-bold text-amber-900">กฎเหล็ก</p>
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-amber-900/80">
          <li>ตัวละครที่ได้แต้มไปแล้ว ห้ามตอบซ้ำทั้งเกม</li>
          <li>
            {!s ? 'มีเวลาหาคำตอบตามที่ Host ตั้ง' : s.answerSeconds === 0 ? 'ไม่จับเวลา' : `มีเวลาหาคำตอบรอบละ ${s.answerSeconds} วินาที`}{' '}
            — คิดไม่ออกกด “ขอข้ามรอบ” ทั้งคู่ได้
          </li>
          <li>เวลาหยุดเดินระหว่างรอตัดสิน Agree / Disagree</li>
        </ul>
      </div>
    </div>
  );
}
