import { useState } from 'react';
import type { PublicPlayer, RoomSnapshot } from '../../../shared/types';
import { OpponentAwayBanner, TopBar } from '../components/chrome';
import { RulesList } from '../components/game-parts';
import { IconCheck, IconClock, IconCopy, IconCrown, IconLink, IconShare, IconUsers } from '../components/icons';
import { Avatar, Button, Card, SectionTitle, ThinkingDots, cx } from '../components/ui';
import { canShare, copyText, useInviteLink } from '../lib/invite';
import { actions, toast } from '../lib/store';
import { TimerPicker } from './Home';

export function Lobby({ snapshot }: { snapshot: RoomSnapshot }) {
  const { you, players, timerSeconds, phase, roomCode } = snapshot;
  const host = players.find((p) => p.role === 'A');
  const guest = players.find((p) => p.role === 'B');
  const canStart = you.isHost && phase === 'LOBBY' && Boolean(host?.connected && guest?.connected);

  return (
    <>
      <TopBar />
      <main className="mx-auto grid w-full grid-cols-1 max-w-6xl items-start gap-4 px-4 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6 md:grid-cols-2 md:gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="empty:hidden md:col-span-2">
          <OpponentAwayBanner />
        </div>

        <div className="space-y-4 md:space-y-5">
          <InviteCard roomCode={roomCode} waiting={phase === 'WAITING_FOR_PLAYERS'} />
          <Card>
            <SectionTitle
              icon={<IconClock size={18} />}
              right={!you.isHost ? <span className="text-xs text-slate-400">เจ้าของห้องเป็นผู้ตั้งค่า</span> : null}
            >
              เวลาคิดต่อรอบ
            </SectionTitle>
            <TimerPicker value={timerSeconds} onChange={actions.updateTimer} disabled={!you.isHost} />
          </Card>
        </div>

        <Card>
          <SectionTitle icon={<IconUsers size={18} />} right={<span className="text-xs text-slate-400">{players.length}/2</span>}>
            ผู้เล่นในห้อง
          </SectionTitle>
          <div className="space-y-2.5">
            <Seat player={host} label="Player A · เจ้าของห้อง" isYou={host?.id === you.id} />
            <Seat player={guest} label="Player B · ผู้เข้าร่วม" isYou={guest?.id === you.id} />
          </div>

          <div className="mt-5">
            {you.isHost ? (
              <>
                <Button size="xl" className="w-full" disabled={!canStart} onClick={actions.startGame}>
                  เริ่มเกม
                </Button>
                {!canStart ? (
                  <p className="mt-2 text-center text-sm text-slate-500">รอผู้เล่นอีกคนเข้าร่วมก่อนนะ</p>
                ) : null}
              </>
            ) : (
              <div className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-indigo-50 font-display font-medium text-indigo-700">
                รอ {host?.name ?? 'เจ้าของห้อง'} กดเริ่มเกม <ThinkingDots />
              </div>
            )}
          </div>

          <div className="mt-6 hidden border-t border-slate-100 pt-5 md:block">
            <SectionTitle>กติกา</SectionTitle>
            <RulesList timerSeconds={timerSeconds} />
          </div>
        </Card>

        <Card className="md:hidden">
          <SectionTitle>กติกา</SectionTitle>
          <RulesList timerSeconds={timerSeconds} />
        </Card>
      </main>
    </>
  );
}

function Seat({ player, label, isYou }: { player?: PublicPlayer; label: string; isYou: boolean }) {
  if (!player) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 p-3">
        <span className="flex size-12 items-center justify-center rounded-full bg-slate-100 text-slate-300 sm:size-14">
          <IconUsers size={22} />
        </span>
        <div className="leading-tight">
          <p className="text-xs text-slate-400">{label}</p>
          <p className="mt-1 flex items-center gap-1.5 font-medium text-slate-500">
            รอผู้เล่นเข้าร่วม <ThinkingDots />
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex animate-rise items-center gap-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-100">
      <Avatar name={player.name} role={player.role} size="lg" />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="text-xs text-slate-400">{label}</p>
        <p className="mt-1 flex items-center gap-1.5 truncate font-display text-lg font-semibold text-slate-800">
          {player.isHost ? <IconCrown size={16} className="shrink-0 text-amber-500" /> : null}
          <span className="truncate">{player.name}</span>
          {isYou ? <span className="shrink-0 text-sm font-normal text-slate-400">(คุณ)</span> : null}
        </p>
      </div>
      <span
        className={cx(
          'flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
          player.connected ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
        )}
      >
        <span className={cx('size-2 rounded-full', player.connected ? 'bg-emerald-500' : 'bg-amber-500')} />
        {player.connected ? 'Connected' : 'หลุด'}
      </span>
    </div>
  );
}

function InviteCard({ roomCode, waiting }: { roomCode: string; waiting: boolean }) {
  const { url, lanSwapped } = useInviteLink(roomCode);
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);

  const copy = async (what: 'code' | 'link') => {
    const ok = await copyText(what === 'code' ? roomCode : url);
    if (ok) {
      setCopied(what);
      setTimeout(() => setCopied(null), 1800);
    } else toast('คัดลอกไม่สำเร็จ ลองกดค้างที่ลิงก์เพื่อคัดลอก', 'warn');
  };
  const share = () => {
    navigator
      .share({ title: 'มาเล่น "พิมพ์จนกว่าคำจะตรงกัน" กัน!', text: `รหัสห้อง ${roomCode}`, url })
      .catch(() => undefined);
  };

  return (
    <Card className="relative overflow-hidden">
      <div className="pointer-events-none absolute -top-16 -right-16 size-48 rounded-full bg-linear-to-br from-violet-200/60 to-blue-200/60 blur-2xl" />
      <p className="relative text-sm font-semibold text-slate-500">{waiting ? 'ชวนเพื่อนเข้าห้อง' : 'รหัสห้อง'}</p>
      <button
        type="button"
        onClick={() => copy('code')}
        className="relative mt-1 flex items-center gap-3 rounded-2xl text-left"
        title="คัดลอกรหัสห้อง"
      >
        <span className="bg-linear-to-r from-violet-700 to-blue-600 bg-clip-text font-display text-5xl font-extrabold tracking-[0.12em] text-transparent sm:text-6xl">
          {roomCode}
        </span>
        <span className="flex size-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
          {copied === 'code' ? <IconCheck size={18} /> : <IconCopy size={18} />}
        </span>
      </button>

      <div className="relative mt-4">
        <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <IconLink size={16} className="text-indigo-500" /> Invite Link
        </p>
        <div className="flex items-center gap-2 rounded-2xl bg-slate-50 p-1.5 pl-3.5 ring-1 ring-slate-200">
          <span className="min-w-0 flex-1 truncate text-sm text-slate-600 select-all">{url}</span>
          <Button size="md" variant="primary" onClick={() => copy('link')} className="shrink-0">
            {copied === 'link' ? <IconCheck size={18} /> : <IconCopy size={18} />}
            {copied === 'link' ? 'คัดลอกแล้ว' : 'Copy Link'}
          </Button>
        </div>
        {canShare() ? (
          <Button variant="secondary" size="md" className="mt-2 w-full" onClick={share}>
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
