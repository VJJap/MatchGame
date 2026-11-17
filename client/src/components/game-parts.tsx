import { useEffect, useRef } from 'react';
import type { PlayerRole, PublicPlayer, RoomSnapshot, RoundRecord } from '../../../shared/types';
import { useNow } from '../lib/hooks';
import { sfx } from '../lib/sound';
import { IconCheck, IconLink, IconLock, IconWifiOff, IconX } from './icons';
import { Avatar, ROLE_STYLE, ThinkingDots, WordChip, cx } from './ui';

export const roundLabel = (round: number) => (round === 0 ? 'คำเริ่มต้น' : `รอบที่ ${round}`);

// ------------------------------------------------------------------ Timer

export function TimerRing({ snapshot, receivedAt }: { snapshot: RoomSnapshot; receivedAt: number }) {
  const t = snapshot.timer;
  const running = Boolean(t && !t.paused);
  const now = useNow(100, running);
  if (!t) return null;
  const remaining = t.paused ? t.remainingMs : Math.max(0, t.remainingMs - (now - receivedAt));
  const secs = Math.ceil(remaining / 1000);
  const frac = t.totalMs > 0 ? remaining / t.totalMs : 0;
  const R = 26;
  const C = 2 * Math.PI * R;
  const danger = !t.paused && secs <= 5;
  const warn = !t.paused && secs <= 10;
  const color = t.paused ? '#94a3b8' : danger ? '#e11d48' : warn ? '#f59e0b' : '#6d5cf6';

  return (
    <div
      className={cx('relative size-16 shrink-0 sm:size-[72px]', danger && 'animate-tick')}
      role="timer"
      aria-label={t.paused ? 'เวลาหยุดชั่วคราว' : `เหลือเวลา ${secs} วินาที`}
    >
      <svg viewBox="0 0 64 64" className="size-full -rotate-90">
        <circle cx="32" cy="32" r={R} fill="none" stroke="#eef2ff" strokeWidth="6" />
        <circle
          cx="32"
          cy="32"
          r={R}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - frac)}
          style={{ transition: 'stroke-dashoffset 120ms linear, stroke 300ms' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        {t.paused ? (
          <span className="font-display text-xs font-semibold text-slate-500">หยุด</span>
        ) : (
          <>
            <span className="font-display text-xl font-bold tabular-nums sm:text-2xl" style={{ color }}>
              {secs}
            </span>
            <span className="mt-0.5 text-[10px] text-slate-400">วินาที</span>
          </>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Prompt

export function PromptWords({ snapshot }: { snapshot: RoomSnapshot }) {
  const nameOf = (r: PlayerRole) => snapshot.players.find((p) => p.role === r)?.name ?? (r === 'A' ? 'A' : 'B');
  if (!snapshot.prompt) {
    return (
      <div className="rounded-3xl bg-linear-to-br from-violet-50 via-indigo-50 to-blue-50 px-5 py-6 text-center ring-1 ring-indigo-100 sm:py-8">
        <p className="font-display text-xl font-bold text-indigo-900 sm:text-2xl">พิมพ์คำอะไรก็ได้ 1 คำ</p>
        <p className="mt-1.5 text-sm text-slate-500 sm:text-[15px]">
          เปิดเกมแบบอิสระ — อีกฝ่ายจะไม่เห็นคำของคุณจนกว่าจะเปิดพร้อมกัน
        </p>
      </div>
    );
  }
  return (
    <div key={snapshot.round} className="animate-rise">
      <p className="mb-2.5 text-center text-sm text-slate-500 sm:text-[15px]">หาคำที่เชื่อมโยงอยู่ “ตรงกลาง” ระหว่าง</p>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4">
        {(['A', 'B'] as const).map((r, i) => (
          <PromptBubble key={r} role={r} word={snapshot.prompt![r]} owner={nameOf(r)} order={i} />
        ))}
        <span className="col-start-2 row-start-1 flex size-10 items-center justify-center rounded-full bg-white text-indigo-500 shadow-md ring-1 ring-indigo-100 sm:size-12">
          <IconLink size={20} />
        </span>
      </div>
    </div>
  );
}

function PromptBubble({ role, word, owner, order }: { role: PlayerRole; word: string; owner: string; order: number }) {
  return (
    <div
      className={cx(
        'flex min-h-24 flex-col items-center justify-center rounded-3xl px-3 py-4 text-center ring-1 sm:min-h-32 sm:px-5',
        ROLE_STYLE[role].soft,
        ROLE_STYLE[role].ring,
        order === 0 ? 'col-start-1' : 'col-start-3',
        'row-start-1',
      )}
    >
      <span
        className={cx(
          'font-display text-2xl leading-tight font-bold wrap-anywhere sm:text-3xl lg:text-4xl',
          ROLE_STYLE[role].text,
        )}
      >
        {word}
      </span>
      <span className="mt-1.5 max-w-full truncate text-xs text-slate-500">คำของ {owner}</span>
    </div>
  );
}

// ------------------------------------------------------------------ Player status

export function PlayerStatus({ player, isYou, phase }: { player: PublicPlayer; isYou: boolean; phase: RoomSnapshot['phase'] }) {
  const inRound = phase === 'INITIAL_INPUT' || phase === 'ROUND_INPUT' || phase === 'WAITING_FOR_READY';
  const ready = player.ready || phase === 'COUNTDOWN' || phase === 'REVEAL';
  return (
    <div
      className={cx(
        'flex min-w-0 items-center gap-2.5 rounded-2xl p-2.5 ring-1 transition sm:p-3',
        ready ? 'bg-emerald-50 ring-emerald-200' : 'bg-slate-50 ring-slate-200',
      )}
    >
      <Avatar name={player.name} role={player.role} size="sm" />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-sm font-semibold text-slate-800">
          {player.name}
          {isYou ? <span className="font-normal text-slate-400"> (คุณ)</span> : null}
        </p>
        <p
          className={cx(
            'mt-0.5 flex items-center gap-1 text-xs font-medium',
            !player.connected ? 'text-amber-600' : ready ? 'text-emerald-600' : 'text-slate-500',
          )}
        >
          {!player.connected ? (
            <>
              <IconWifiOff size={13} /> หลุดการเชื่อมต่อ
            </>
          ) : ready ? (
            <>
              <IconCheck size={14} /> Ready
            </>
          ) : inRound ? (
            <>
              กำลังคิด <ThinkingDots />
            </>
          ) : (
            'รอ'
          )}
        </p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ History

export function HistoryList({ snapshot, compact }: { snapshot: RoomSnapshot; compact?: boolean }) {
  const rows = [...snapshot.history].reverse();
  const nameOf = (r: PlayerRole) => snapshot.players.find((p) => p.role === r)?.name ?? r;
  if (rows.length === 0) {
    return (
      <p className="rounded-2xl bg-slate-50 px-4 py-5 text-center text-sm text-slate-400">
        ยังไม่มีประวัติ — คำที่เปิดแล้วจะแสดงที่นี่
      </p>
    );
  }
  return (
    <ol className={cx('space-y-2', compact && 'max-h-72 overflow-y-auto pr-1 lg:max-h-[calc(100dvh-24rem)]')}>
      {rows.map((h) => (
        <li key={h.round} className="flex items-center gap-2 rounded-2xl bg-slate-50 p-2.5 ring-1 ring-slate-100">
          <span className="w-14 shrink-0 text-center text-[11px] leading-tight font-semibold text-slate-400 sm:w-16">
            {roundLabel(h.round)}
          </span>
          <div className="grid min-w-0 flex-1 grid-cols-2 gap-1.5">
            <WordChip word={h.answers.A} role="A" />
            <WordChip word={h.answers.B} role="B" />
          </div>
          <span
            className={cx(
              'flex size-7 shrink-0 items-center justify-center rounded-full',
              h.match ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-50 text-rose-400',
            )}
            title={h.match ? 'MATCH' : 'NOT MATCH'}
          >
            {h.match ? <IconCheck size={16} /> : <IconX size={14} />}
          </span>
        </li>
      ))}
      <li className="flex justify-center gap-4 pt-1 text-[11px] text-slate-400">
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-violet-500" /> {nameOf('A')}
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-blue-500" /> {nameOf('B')}
        </span>
      </li>
    </ol>
  );
}

// ------------------------------------------------------------------ Countdown overlay

export function CountdownOverlay({ snapshot, receivedAt }: { snapshot: RoomSnapshot; receivedAt: number }) {
  const active = snapshot.phase === 'COUNTDOWN' && snapshot.countdownRemainingMs !== null;
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
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-indigo-950/55 px-6 backdrop-blur-sm">
      <p className="mb-6 animate-rise font-display text-lg font-semibold text-white/90 sm:text-xl">
        ทั้งคู่พร้อมแล้ว! เปิดคำใน…
      </p>
      <div className="relative flex size-40 items-center justify-center sm:size-52">
        <div className="absolute inset-0 animate-glow rounded-full bg-white/10 ring-2 ring-white/30" />
        <span
          key={n}
          className="animate-count font-display text-8xl font-extrabold text-white drop-shadow-[0_6px_24px_rgba(167,139,250,0.9)] sm:text-9xl"
        >
          {n}
        </span>
      </div>
      <div className="mt-8 flex items-center gap-3">
        {snapshot.players.map((p) => (
          <span key={p.id} className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-sm text-white">
            <IconLock size={14} /> {p.name}
          </span>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Reveal overlay

export function RevealOverlay({ snapshot }: { snapshot: RoomSnapshot }) {
  const rec = snapshot.phase === 'REVEAL' ? snapshot.lastReveal : null;
  if (!rec) return null;
  return <RevealCard key={rec.round} rec={rec} snapshot={snapshot} />;
}

function RevealCard({ rec, snapshot }: { rec: RoundRecord; snapshot: RoomSnapshot }) {
  const me = snapshot.you.role;
  const order: PlayerRole[] = me === 'A' ? ['A', 'B'] : ['B', 'A'];
  const nameOf = (r: PlayerRole) => snapshot.players.find((p) => p.role === r)?.name ?? r;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-indigo-950/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl animate-pop rounded-[2rem] bg-white p-5 text-center shadow-2xl sm:p-8">
        <p className="font-display text-sm font-semibold tracking-wide text-indigo-500">{roundLabel(rec.round)}</p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-5">
          {order.map((r, i) => (
            <div
              key={r}
              className={cx(
                'flex min-h-28 animate-flip-in flex-col items-center justify-center rounded-3xl p-3 ring-2 sm:min-h-36 sm:p-5',
                rec.match ? 'bg-emerald-50 ring-emerald-300' : cx(ROLE_STYLE[r].soft, ROLE_STYLE[r].ring),
              )}
              style={{ animationDelay: `${i * 120}ms` }}
            >
              <span className="mb-1 text-xs text-slate-500">
                {nameOf(r)}
                {r === me ? ' (คุณ)' : ''}
              </span>
              <span
                className={cx(
                  'font-display text-2xl leading-tight font-bold wrap-anywhere sm:text-4xl',
                  rec.match ? 'text-emerald-700' : ROLE_STYLE[r].text,
                )}
              >
                {rec.answers[r]}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-6 animate-pop" style={{ animationDelay: '650ms' }}>
          {rec.match ? (
            <>
              <p className="font-display text-4xl font-extrabold tracking-wide text-emerald-600 sm:text-5xl">MATCH!</p>
              <p className="mt-1 font-display text-lg font-semibold text-slate-700 sm:text-xl">เราคิดตรงกันแล้ว! 🎉</p>
            </>
          ) : (
            <>
              <p className="font-display text-3xl font-extrabold tracking-wide text-rose-500 sm:text-4xl">NOT MATCH</p>
              <p className="mt-1 font-display text-lg font-semibold text-slate-700 sm:text-xl">ยังไม่ตรงกัน ลองอีกครั้ง!</p>
              <p className="mt-2 text-sm text-slate-500">สองคำนี้จะกลายเป็นโจทย์ของรอบถัดไป</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Rules

export function RulesList({ timerSeconds }: { timerSeconds: number }) {
  const rules = [
    ['เปิดเกม', 'ทั้งคู่พิมพ์คำอะไรก็ได้คนละ 1 คำ แล้วเปิดพร้อมกัน'],
    ['หาคำตรงกลาง', 'คิดคำที่เชื่อมโยงระหว่าง 2 คำล่าสุด'],
    ['กด Ready', 'เมื่อทั้งคู่ Ready จะนับ 3-2-1 แล้วเปิดคำพร้อมกัน'],
    ['เล่นจนกว่าจะตรง', 'ถ้ายังไม่ตรง คำล่าสุดของทั้งคู่จะเป็นโจทย์ใหม่'],
  ];
  const iron = [
    'ห้ามใช้คำที่ตัวเองเคยส่งไปแล้ว (คำของอีกฝ่ายใช้ได้)',
    `คิดได้รอบละ ${timerSeconds} วินาที — หมดเวลาจะเริ่มรอบเดิมใหม่`,
    'ตัวสะกดต้องตรงกันทุกตัวอักษร: “ไอติม” ≠ “ไอศกรีม”, “Apple” ≠ “apple”',
  ];
  return (
    <div className="space-y-4">
      <ol className="space-y-2.5">
        {rules.map(([title, body], i) => (
          <li key={title} className="flex gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 font-display text-sm font-bold text-indigo-700">
              {i + 1}
            </span>
            <p className="text-sm leading-relaxed text-slate-600 sm:text-[15px]">
              <span className="font-semibold text-slate-800">{title}:</span> {body}
            </p>
          </li>
        ))}
      </ol>
      <div className="rounded-2xl bg-amber-50 p-3.5 ring-1 ring-amber-100">
        <p className="mb-1.5 font-display text-sm font-semibold text-amber-900">กฎเหล็ก</p>
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-amber-900/80">
          {iron.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
