import confetti from 'canvas-confetti';
import { useEffect } from 'react';
import type { PlayerRole, RoomSnapshot } from '../../../shared/types';
import { TopBar } from '../components/chrome';
import { roundLabel } from '../components/game-parts';
import { IconCheck, IconHome, IconRefresh } from '../components/icons';
import { Avatar, Button, Card, SectionTitle, ThinkingDots, WordChip, cx } from '../components/ui';
import { prefersReducedMotion } from '../lib/hooks';
import { actions } from '../lib/store';

const COLORS = ['#8b5cf6', '#6366f1', '#3b82f6', '#ffffff', '#f0abfc', '#7dd3fc'];

function celebrate() {
  if (prefersReducedMotion()) return;
  const end = Date.now() + 1400;
  confetti({ particleCount: 140, spread: 90, startVelocity: 48, origin: { y: 0.6 }, colors: COLORS });
  const frame = () => {
    confetti({ particleCount: 4, angle: 60, spread: 60, origin: { x: 0, y: 0.7 }, colors: COLORS });
    confetti({ particleCount: 4, angle: 120, spread: 60, origin: { x: 1, y: 0.7 }, colors: COLORS });
    if (Date.now() < end) requestAnimationFrame(frame);
  };
  frame();
}

export function Victory({ snapshot }: { snapshot: RoomSnapshot }) {
  const { winner, players, you, history } = snapshot;
  const me = players.find((p) => p.id === you.id);
  const opp = players.find((p) => p.id !== you.id);
  const nameOf = (r: PlayerRole) => players.find((p) => p.role === r)?.name ?? r;

  useEffect(() => {
    celebrate();
    return () => {
      confetti.reset();
    };
  }, []);

  const rounds = winner?.rounds ?? 0;
  const iWant = Boolean(me?.wantsRematch);
  const theyWant = Boolean(opp?.wantsRematch);

  return (
    <>
      <TopBar />
      <main className="mx-auto grid w-full grid-cols-1 max-w-5xl gap-4 px-4 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6 md:gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start">
        <Card className="relative animate-pop overflow-hidden text-center sm:py-10">
          <div className="pointer-events-none absolute inset-x-0 -top-24 mx-auto size-72 rounded-full bg-linear-to-br from-violet-300/50 to-sky-300/50 blur-3xl" />
          <p className="relative text-5xl sm:text-6xl" aria-hidden="true">
            🎉
          </p>
          <h1 className="relative mt-3 font-display text-3xl font-extrabold text-slate-900 sm:text-4xl">
            เราคิดตรงกันแล้ว!
          </h1>
          <p className="relative mt-1 text-slate-500">ยินดีด้วย คุณกับ {opp?.name ?? 'เพื่อน'} คิดตรงกันในที่สุด</p>

          <div className="relative mx-auto mt-6 max-w-md rounded-3xl bg-linear-to-br from-violet-600 via-indigo-600 to-blue-600 p-[3px] shadow-xl shadow-indigo-500/30">
            <div className="rounded-[calc(1.5rem-3px)] bg-white px-5 py-6">
              <p className="text-xs font-semibold tracking-wide text-indigo-500">คำที่ตรงกัน</p>
              <p className="mt-1 font-display text-4xl font-extrabold wrap-anywhere text-indigo-900 sm:text-5xl">
                {winner?.word}
              </p>
            </div>
          </div>

          <div className="relative mt-5 flex items-center justify-center gap-3 sm:gap-6">
            <Stat value={rounds === 0 ? 'คำแรก!' : String(rounds)} label={rounds === 0 ? 'ตรงกันตั้งแต่' : 'รอบที่ใช้'} />
            <span className="h-10 w-px bg-slate-200" />
            <Stat value={String(history.length)} label="ครั้งที่เปิดคำ" />
          </div>

          <div className="relative mt-7 grid gap-2.5 sm:grid-cols-2">
            <Button size="xl" onClick={actions.rematch} disabled={iWant}>
              {iWant ? (
                <>
                  รออีกฝ่าย <ThinkingDots />
                </>
              ) : (
                <>
                  <IconRefresh size={20} /> เล่นอีกครั้ง
                </>
              )}
            </Button>
            <Button size="xl" variant="secondary" onClick={actions.leave}>
              <IconHome size={20} /> กลับหน้าแรก
            </Button>
          </div>
          {theyWant && !iWant ? (
            <p className="relative mt-3 animate-rise text-sm font-medium text-indigo-600">
              {opp?.name} อยากเล่นอีกครั้ง! กด “เล่นอีกครั้ง” เพื่อกลับไปที่ห้อง
            </p>
          ) : null}
          {iWant && !theyWant ? (
            <p className="relative mt-3 text-sm text-slate-500">เมื่อทั้งคู่กดเล่นอีกครั้ง จะกลับไปที่ห้องรอเริ่มเกม</p>
          ) : null}
        </Card>

        <Card>
          <SectionTitle>เส้นทางความคิด</SectionTitle>
          <div className="mb-3 flex items-center gap-4 text-xs text-slate-500">
            {(['A', 'B'] as const).map((r) => (
              <span key={r} className="flex items-center gap-1.5">
                <Avatar name={nameOf(r)} role={r} size="sm" />
                {nameOf(r)}
              </span>
            ))}
          </div>
          <ol className="relative space-y-2.5 border-l-2 border-dashed border-indigo-100 pl-4">
            {history.map((h) => (
              <li key={h.round} className="relative">
                <span
                  className={cx(
                    'absolute top-3 -left-[23px] flex size-3 items-center justify-center rounded-full ring-4 ring-white',
                    h.match ? 'bg-emerald-500' : 'bg-indigo-300',
                  )}
                />
                <p className="mb-1 text-[11px] font-semibold text-slate-400">{roundLabel(h.round)}</p>
                {h.match ? (
                  <span className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-1.5 font-display font-semibold text-emerald-700 ring-1 ring-emerald-200">
                    <IconCheck size={16} /> {h.answers.A}
                  </span>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    <WordChip word={h.answers.A} role="A" />
                    <WordChip word={h.answers.B} role="B" />
                  </div>
                )}
              </li>
            ))}
          </ol>
        </Card>
      </main>
    </>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="leading-tight">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-0.5 font-display text-2xl font-bold text-slate-800">{value}</p>
    </div>
  );
}
