import type { CharPublicPlayer, CharSnapshot } from '../../../../shared/character';
import { IconCrown, IconUsers } from '../../components/icons';
import { Button, Card, SectionTitle, ThinkingDots, cx } from '../../components/ui';
import {
  AnswerTimePicker,
  CAvatar,
  CategoryChecklist,
  CharAwayBanner,
  CharInviteCard,
  CharRules,
  CharTopBar,
  TargetPicker,
} from '../parts';
import { charActions } from '../store';

export function CharLobby({ snapshot }: { snapshot: CharSnapshot }) {
  const { you, players, phase, settings } = snapshot;
  const host = players.find((p) => p.role === 'A');
  const guest = players.find((p) => p.role === 'B');
  const canStart = you.isHost && phase === 'LOBBY' && Boolean(host?.connected && guest?.connected);
  const locked = !you.isHost;

  return (
    <>
      <CharTopBar />
      <main className="mx-auto grid w-full max-w-6xl grid-cols-1 items-start gap-4 px-4 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6 md:grid-cols-2 md:gap-5">
        <div className="empty:hidden md:col-span-2">
          <CharAwayBanner />
        </div>

        <div className="space-y-4 md:space-y-5">
          <CharInviteCard roomCode={snapshot.roomCode} waiting={phase === 'WAITING_FOR_PLAYERS'} />
          <Card className="space-y-4">
            <SectionTitle right={locked ? <span className="text-xs text-slate-400">เจ้าของห้องเป็นผู้ตั้งค่า</span> : null}>
              ตั้งค่าเกม
            </SectionTitle>
            <CategoryChecklist
              value={settings.categories}
              disabled={locked}
              onChange={(categories) => charActions.updateSettings({ categories })}
            />
            <div className="grid gap-4 sm:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] md:grid-cols-1 xl:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
              <div>
                <p className="mb-2 text-sm font-semibold text-slate-600">แต้มเป้าหมาย</p>
                <TargetPicker
                  value={settings.targetScore}
                  disabled={locked}
                  onChange={(targetScore) => charActions.updateSettings({ targetScore })}
                />
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold text-slate-600">เวลาหาคำตอบต่อรอบ</p>
                <AnswerTimePicker
                  value={settings.answerSeconds}
                  disabled={locked}
                  onChange={(answerSeconds) => charActions.updateSettings({ answerSeconds })}
                />
              </div>
            </div>
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
                <Button variant="pop" size="xl" className="w-full" disabled={!canStart} onClick={charActions.startGame}>
                  เริ่มเกม!
                </Button>
                {!canStart ? <p className="mt-2 text-center text-sm text-slate-500">รอผู้เล่นอีกคนเข้าร่วมก่อนนะ</p> : null}
              </>
            ) : (
              <div className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-rose-50 font-display font-semibold text-rose-600">
                รอ {host?.name ?? 'เจ้าของห้อง'} กดเริ่มเกม <ThinkingDots />
              </div>
            )}
          </div>
          <div className="mt-6 border-t border-slate-100 pt-5">
            <SectionTitle>วิธีเล่น</SectionTitle>
            <CharRules snapshot={snapshot} />
          </div>
        </Card>
      </main>
    </>
  );
}

function Seat({ player, label, isYou }: { player?: CharPublicPlayer; label: string; isYou: boolean }) {
  if (!player) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-rose-200 p-3">
        <span className="flex size-12 items-center justify-center rounded-full bg-rose-50 text-rose-300 sm:size-14">
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
      <CAvatar name={player.name} role={player.role} size="lg" />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="text-xs text-slate-400">{label}</p>
        <p className="mt-1 flex items-center gap-1.5 truncate font-display text-lg font-bold text-slate-800">
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
