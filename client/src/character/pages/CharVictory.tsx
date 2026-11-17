import confetti from 'canvas-confetti';
import { useEffect } from 'react';
import type { CharSnapshot } from '../../../../shared/character';
import { IconHome, IconRefresh } from '../../components/icons';
import { Button, Card, SectionTitle, ThinkingDots } from '../../components/ui';
import { prefersReducedMotion } from '../../lib/hooks';
import { CAvatar, CROLE, CharacterGallery, CharTopBar, RoundHistory } from '../parts';
import { charActions } from '../store';

const COLORS = ['#fb923c', '#f43f5e', '#facc15', '#ffffff', '#c026d3', '#8b5cf6'];

function celebrate() {
  if (prefersReducedMotion()) return;
  const end = Date.now() + 1600;
  confetti({ particleCount: 160, spread: 100, startVelocity: 50, origin: { y: 0.55 }, colors: COLORS });
  const frame = () => {
    confetti({ particleCount: 5, angle: 60, spread: 65, origin: { x: 0, y: 0.75 }, colors: COLORS });
    confetti({ particleCount: 5, angle: 120, spread: 65, origin: { x: 1, y: 0.75 }, colors: COLORS });
    if (Date.now() < end) requestAnimationFrame(frame);
  };
  frame();
}

export function CharVictory({ snapshot }: { snapshot: CharSnapshot }) {
  const { winner, players, you } = snapshot;
  const me = players.find((p) => p.id === you.id);
  const opp = players.find((p) => p.id !== you.id);
  const iWon = winner?.role === you.role;
  const A = players.find((p) => p.role === 'A');
  const B = players.find((p) => p.role === 'B');

  useEffect(() => {
    celebrate();
    return () => {
      confetti.reset();
    };
  }, []);

  return (
    <>
      <CharTopBar />
      <main className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-4 px-4 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6 md:gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start">
        <Card className="relative animate-pop overflow-hidden text-center sm:py-10">
          <div className="pointer-events-none absolute inset-x-0 -top-24 mx-auto size-72 rounded-full bg-linear-to-br from-yellow-200/80 to-rose-300/60 blur-3xl" />
          <p className="relative animate-wiggle text-7xl sm:text-8xl" aria-hidden="true">
            🏆
          </p>
          <h1 className="relative mt-3 font-display text-4xl font-black text-slate-900 sm:text-5xl">
            {iWon ? 'คุณชนะ!' : `${winner?.name ?? ''} ชนะ!`}
          </h1>
          <p className="relative mt-1 text-slate-500">
            {iWon ? `ทายเก่งกว่า ${opp?.name ?? 'เพื่อน'} ไปนิดเดียว 😎` : 'เกือบแล้ว! ขอแก้มือรอบหน้า'}
          </p>

          <div className="relative mx-auto mt-6 grid max-w-md grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 rounded-3xl bg-slate-50 p-4 ring-1 ring-slate-100">
            {[A, B].map((p, i) =>
              p ? (
                <div key={p.id} className={i === 1 ? 'order-3 flex flex-col items-center' : 'flex flex-col items-center'}>
                  <CAvatar name={p.name} role={p.role} size="lg" />
                  <p className="mt-1 max-w-full truncate text-sm font-semibold text-slate-600">{p.name}</p>
                  <p className={`font-display text-5xl font-black ${CROLE[p.role].text}`}>{p.score}</p>
                </div>
              ) : (
                <span key={i} />
              ),
            )}
            <span className="order-2 font-display text-2xl font-black text-slate-300">:</span>
          </div>
          <p className="relative mt-2 text-xs text-slate-400">เป้าหมาย {snapshot.settings.targetScore} แต้ม · เล่นไป {snapshot.history.length} รอบ</p>

          <div className="relative mt-7 grid gap-2.5 sm:grid-cols-2">
            <Button variant="pop" size="xl" onClick={charActions.rematch} disabled={Boolean(me?.wantsRematch)}>
              {me?.wantsRematch ? (
                <>
                  รออีกฝ่าย <ThinkingDots />
                </>
              ) : (
                <>
                  <IconRefresh size={20} /> เล่นอีกครั้ง
                </>
              )}
            </Button>
            <Button variant="popSoft" size="xl" onClick={charActions.leave}>
              <IconHome size={20} /> กลับหน้าแรก
            </Button>
          </div>
          {opp?.wantsRematch && !me?.wantsRematch ? (
            <p className="relative mt-3 animate-rise text-sm font-medium text-rose-600">
              {opp.name} อยากแก้มือ! กด “เล่นอีกครั้ง” เพื่อกลับไปที่ห้อง
            </p>
          ) : null}
        </Card>

        <div className="space-y-4 md:space-y-5">
          <Card>
            <SectionTitle right={<span className="text-xs text-slate-400">{snapshot.usedCharacters.length} ตัว</span>}>
              ตัวละครที่ทายได้
            </SectionTitle>
            <CharacterGallery used={snapshot.usedCharacters} nameOf={(r) => players.find((p) => p.role === r)?.name ?? r} />
          </Card>
          <Card>
            <SectionTitle>สรุปทุกรอบ</SectionTitle>
            <RoundHistory snapshot={snapshot} />
          </Card>
        </div>
      </main>
    </>
  );
}
