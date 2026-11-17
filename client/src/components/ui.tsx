import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import type { PlayerRole } from '../../../shared/types';
import { setMuted, useMuted } from '../lib/sound';
import { IconMute, IconVolume } from './icons';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

// ------------------------------------------------------------------ Button

type Variant = 'primary' | 'secondary' | 'ghost' | 'light' | 'danger' | 'pop' | 'popSoft' | 'agree' | 'disagree' | 'white';
type Size = 'md' | 'lg' | 'xl';

const VARIANTS: Record<Variant, string> = {
  primary:
    'text-white bg-linear-to-r from-violet-600 via-indigo-600 to-blue-600 shadow-lg shadow-indigo-600/30 hover:brightness-110 active:brightness-95',
  secondary: 'text-indigo-700 bg-indigo-50 hover:bg-indigo-100 active:bg-indigo-200',
  ghost: 'text-slate-600 hover:bg-slate-100 active:bg-slate-200',
  light: 'text-white bg-white/15 hover:bg-white/25 active:bg-white/30 backdrop-blur ring-1 ring-white/25',
  danger: 'text-rose-600 bg-rose-50 hover:bg-rose-100 active:bg-rose-200',
  // MatchCharacter (quiz show)
  pop: 'text-white bg-linear-to-r from-orange-500 via-rose-500 to-fuchsia-600 shadow-lg shadow-rose-600/30 hover:brightness-110 active:brightness-95',
  popSoft: 'text-rose-700 bg-rose-50 hover:bg-rose-100 active:bg-rose-200',
  agree: 'text-white bg-linear-to-b from-emerald-400 to-emerald-600 shadow-lg shadow-emerald-600/30 hover:brightness-105',
  disagree: 'text-white bg-linear-to-b from-rose-400 to-rose-600 shadow-lg shadow-rose-600/30 hover:brightness-105',
  white: 'text-rose-600 bg-white shadow-lg shadow-rose-900/20 hover:bg-rose-50',
};
const SIZES: Record<Size, string> = {
  md: 'h-11 px-4 text-[15px] rounded-xl gap-2',
  lg: 'h-13 px-6 text-base rounded-2xl gap-2',
  xl: 'h-14 sm:h-16 px-7 text-lg sm:text-xl rounded-2xl gap-2.5',
};

export function Button({
  variant = 'primary',
  size = 'lg',
  className,
  children,
  loading,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || loading}
      className={cx(
        'inline-flex select-none items-center justify-center font-display font-semibold transition duration-150',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-300/70',
        'disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none disabled:brightness-100 active:scale-[0.98]',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cx('inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent', className)}
      aria-hidden="true"
    />
  );
}

// ------------------------------------------------------------------ Card

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={cx(
        'rounded-3xl bg-white/95 p-5 shadow-[0_18px_50px_-18px_rgba(30,27,75,0.45)] ring-1 ring-white/60 backdrop-blur sm:p-6',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ children, icon, right }: { children: ReactNode; icon?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-slate-700 sm:text-base">
        {icon ? <span className="text-indigo-500">{icon}</span> : null}
        {children}
      </h2>
      {right}
    </div>
  );
}

// ------------------------------------------------------------------ Player visuals

export const ROLE_STYLE: Record<PlayerRole, { dot: string; soft: string; text: string; ring: string; grad: string }> = {
  A: {
    dot: 'bg-violet-600',
    soft: 'bg-violet-50',
    text: 'text-violet-700',
    ring: 'ring-violet-200',
    grad: 'from-violet-500 to-fuchsia-500',
  },
  B: {
    dot: 'bg-blue-600',
    soft: 'bg-blue-50',
    text: 'text-blue-700',
    ring: 'ring-blue-200',
    grad: 'from-blue-500 to-cyan-500',
  },
};

/** First letter for an avatar. Thai leading vowels (เ แ โ ใ ไ) keep their consonant: "โบ๊ท" → "โบ". */
function avatarInitial(name: string): string {
  const chars = [...name.trim()];
  if (!chars.length) return '?';
  if ('เแโใไ'.includes(chars[0]) && chars[1]) return chars[0] + chars[1];
  return chars[0].toUpperCase();
}

export function Avatar({ name, role, size = 'md' }: { name: string; role: PlayerRole; size?: 'sm' | 'md' | 'lg' }) {
  const initial = avatarInitial(name);
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-linear-to-br font-display font-bold text-white shadow-sm',
        ROLE_STYLE[role].grad,
        size === 'sm' && 'size-8 text-sm',
        size === 'md' && 'size-10 text-base',
        size === 'lg' && 'size-12 text-lg sm:size-14 sm:text-xl',
      )}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}

export function WordChip({ word, role, className }: { word: string; role: PlayerRole; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex max-w-full items-center rounded-xl px-2.5 py-1 text-sm font-medium ring-1 wrap-anywhere',
        ROLE_STYLE[role].soft,
        ROLE_STYLE[role].text,
        ROLE_STYLE[role].ring,
        className,
      )}
    >
      {word}
    </span>
  );
}

// ------------------------------------------------------------------ Misc

export function SoundToggle({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const muted = useMuted();
  return (
    <button
      type="button"
      onClick={() => setMuted(!muted)}
      className={cx(
        'inline-flex size-11 items-center justify-center rounded-xl transition',
        tone === 'light'
          ? 'bg-white/15 text-white ring-1 ring-white/25 hover:bg-white/25'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
      )}
      aria-label={muted ? 'เปิดเสียง' : 'ปิดเสียง'}
      title={muted ? 'เปิดเสียง' : 'ปิดเสียง'}
    >
      {muted ? <IconMute /> : <IconVolume />}
    </button>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="lg-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#lg-bg)" />
      <path
        d="M12 18a6 6 0 0 1 6-6h14a6 6 0 0 1 6 6v8a6 6 0 0 1-6 6h-9l-6 5v-5.4A6 6 0 0 1 12 26z"
        fill="#fff"
        opacity=".95"
      />
      <path d="M52 34a6 6 0 0 0-6-6H32a6 6 0 0 0-6 6v8a6 6 0 0 0 6 6h9l6 5v-5.4A6 6 0 0 0 52 42z" fill="#c4b5fd" />
      <path
        d="m33 38 3.2 3.2L43 34.5"
        fill="none"
        stroke="#4c1d95"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 animate-bounce-dot rounded-full bg-current"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}
