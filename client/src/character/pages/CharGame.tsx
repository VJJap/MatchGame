import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  CATEGORY_INFO,
  MAX_CHARACTER_LENGTH,
  MAX_CLUE_LENGTH,
  MAX_TITLE_LENGTH,
  checkAnswer,
  checkClue,
  findUsedCharacter,
  type CharPublicPlayer,
  type CharSnapshot,
} from '../../../../shared/character';
import type { PlayerRole } from '../../../../shared/types';
import { IconCheck, IconLock, IconWifiOff } from '../../components/icons';
import { Button, Card, SectionTitle, ThinkingDots, cx } from '../../components/ui';
import { hasFinePointer } from '../../lib/hooks';
import {
  BuzzOverlay,
  CAvatar,
  CROLE,
  CategoryBadge,
  CharAwayBanner,
  CharTopBar,
  ClueCountdownOverlay,
  CluePair,
  RoundHistory,
  Scoreboard,
  TimerBar,
  UsedCharacters,
} from '../parts';
import { charActions, useChar } from '../store';

export interface Draft {
  character: string;
  title: string;
}

export function CharGame({ snapshot }: { snapshot: CharSnapshot }) {
  const { receivedAt } = useChar();
  // The answer draft lives here so it survives the BUZZED / REVIEW screens
  // (B keeps what they were typing when A buzzed; A can edit after a Disagree).
  const [draft, setDraft] = useState<Draft>({ character: '', title: '' });
  const round = snapshot.round;
  useEffect(() => setDraft({ character: '', title: '' }), [round]);

  let stage: ReactNode = null;
  switch (snapshot.phase) {
    case 'CLUE_INPUT':
    case 'CLUE_COUNTDOWN':
      stage = <ClueStage key={round} snapshot={snapshot} />;
      break;
    case 'CLUE_REVEAL':
      stage = <RevealStage snapshot={snapshot} />;
      break;
    case 'RACING':
    case 'BUZZED':
      stage = <RaceStage snapshot={snapshot} receivedAt={receivedAt} draft={draft} setDraft={setDraft} />;
      break;
    case 'REVIEW':
      stage = <ReviewStage key={snapshot.pending?.id} snapshot={snapshot} receivedAt={receivedAt} />;
      break;
    case 'ROUND_END':
      stage = <RoundEndStage snapshot={snapshot} />;
      break;
  }

  return (
    <>
      <CharTopBar confirmLeave />
      <main className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-4 px-4 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6 md:gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="space-y-4 md:space-y-5">
          <Scoreboard snapshot={snapshot} />
          <CharAwayBanner />
          {stage}
        </div>
        <aside className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5 lg:sticky lg:top-4 lg:grid-cols-1">
          <Card>
            <SectionTitle right={<span className="text-xs text-slate-400">{snapshot.history.length} รอบ</span>}>
              ประวัติรอบ
            </SectionTitle>
            <div className="max-h-80 overflow-y-auto pr-1 lg:max-h-[calc(100dvh-26rem)]">
              <RoundHistory snapshot={snapshot} />
            </div>
          </Card>
          <Card>
            <SectionTitle>ตัวละครที่ใช้แล้ว</SectionTitle>
            <UsedCharacters used={snapshot.usedCharacters} />
            <p className="mt-3 text-xs leading-relaxed text-slate-400">ตัวละครที่ได้แต้มแล้ว ห้ามตอบซ้ำทั้งเกม</p>
          </Card>
        </aside>
      </main>
      <ClueCountdownOverlay snapshot={snapshot} receivedAt={receivedAt} />
      <BuzzOverlay snapshot={snapshot} />
    </>
  );
}

// ------------------------------------------------------------------ shared bits

function StageHeader({ snapshot, right }: { snapshot: CharSnapshot; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
      <span className="rounded-full bg-rose-500 px-3 py-1 font-display text-sm font-black text-white shadow-sm shadow-rose-500/30 sm:text-base">
        รอบที่ {snapshot.round}
      </span>
      <CategoryBadge category={snapshot.settings.category} tone="dark" />
      {right ? <div className="flex min-w-[10rem] flex-1 justify-end">{right}</div> : null}
    </div>
  );
}

function StatusChip({ player, isYou, ready, readyText, waitText }: {
  player: CharPublicPlayer;
  isYou: boolean;
  ready: boolean;
  readyText: string;
  waitText: string;
}) {
  return (
    <div
      className={cx(
        'flex min-w-0 items-center gap-2.5 rounded-2xl p-2.5 ring-1 transition sm:p-3',
        ready ? 'bg-emerald-50 ring-emerald-200' : 'bg-slate-50 ring-slate-200',
      )}
    >
      <CAvatar name={player.name} role={player.role} size="sm" />
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
              <IconCheck size={14} /> {readyText}
            </>
          ) : (
            <>
              {waitText} <ThinkingDots />
            </>
          )}
        </p>
      </div>
    </div>
  );
}

function nameOf(snapshot: CharSnapshot, role: PlayerRole): string {
  return snapshot.players.find((p) => p.role === role)?.name ?? role;
}

// ------------------------------------------------------------------ 1. Clue

function ClueStage({ snapshot }: { snapshot: CharSnapshot }) {
  const { fieldError } = useChar();
  const [clue, setClue] = useState('');
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const info = CATEGORY_INFO[snapshot.settings.category];
  const example = info.clueExamples[(snapshot.round - 1) % info.clueExamples.length];
  const locked = snapshot.you.lockedClue;
  const check = checkClue(clue);
  const tooLong = clue.trim() && !check.ok && check.code === 'TOO_LONG' ? check.message : null;
  const shownError = tooLong ?? fieldError?.message ?? null;

  useEffect(() => setSending(false), [locked, fieldError]);
  useEffect(() => {
    if (!locked && hasFinePointer()) inputRef.current?.focus();
  }, [locked]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!check.ok || sending || locked || snapshot.phase !== 'CLUE_INPUT') return;
    setSending(true);
    charActions.submitClue(check.value);
  };

  return (
    <Card className="space-y-5">
      <StageHeader snapshot={snapshot} />
      <div>
        <h2 className="font-display text-2xl font-black text-slate-900 sm:text-3xl">ใบ้ลักษณะเด่น 1 อย่าง 🤫</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-500 sm:text-[15px]">
          อีกฝ่ายจะไม่เห็นจนกว่าทั้งคู่จะกด Ready — จากนั้นแข่งกันหา{info.th === 'หนัง' ? 'ตัวละครในหนัง' : `ตัวละคร${info.th}`}ที่มีทั้งสองอย่าง
        </p>
      </div>

      {locked ? (
        <div className="animate-pop rounded-3xl bg-emerald-50 p-4 ring-1 ring-emerald-200 sm:p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-md shadow-emerald-500/30">
              <IconLock size={20} />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-emerald-700">ใบ้ของคุณ (ล็อกแล้ว)</p>
              <p className="truncate font-display text-2xl font-black text-emerald-900">{locked}</p>
            </div>
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-emerald-800">
            {snapshot.phase === 'CLUE_COUNTDOWN' ? 'กำลังเปิดใบ้…' : 'รออีกฝ่ายกด Ready'} <ThinkingDots />
          </p>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-2">
          <label htmlFor="clue" className="sr-only">
            ลักษณะเด่น
          </label>
          <div className="flex flex-col gap-2.5 sm:flex-row">
            <input
              id="clue"
              ref={inputRef}
              value={clue}
              onChange={(e) => {
                setClue(e.target.value);
                charActions.clearFieldError();
              }}
              maxLength={MAX_CLUE_LENGTH * 3}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
              placeholder={`เช่น ${example}`}
              className={cx(
                'h-14 min-w-0 flex-1 rounded-2xl border-2 bg-slate-50 px-4 font-display text-xl font-bold text-slate-800 outline-none transition placeholder:font-sans placeholder:text-base placeholder:font-normal placeholder:text-slate-400 focus:bg-white sm:h-16 sm:text-2xl',
                shownError ? 'border-rose-300 focus:border-rose-400' : 'border-slate-200 focus:border-rose-400',
              )}
            />
            <Button type="submit" variant="pop" size="xl" className="sm:w-40" disabled={!check.ok} loading={sending}>
              Ready
            </Button>
          </div>
          <p className={cx('min-h-5 text-sm', shownError ? 'font-medium text-rose-600' : 'text-slate-400')}>
            {shownError ?? 'กด Ready แล้วแก้ไม่ได้ · ใบ้ควรกว้างพอให้มีหลายตัวละครที่ตรง'}
          </p>
        </form>
      )}

      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        {snapshot.players.map((p) => (
          <StatusChip
            key={p.id}
            player={p}
            isYou={p.id === snapshot.you.id}
            ready={p.clueReady || snapshot.phase === 'CLUE_COUNTDOWN'}
            readyText="Ready"
            waitText="กำลังคิดใบ้"
          />
        ))}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ 2. Reveal

function RevealStage({ snapshot }: { snapshot: CharSnapshot }) {
  return (
    <Card className="space-y-5 text-center">
      <StageHeader snapshot={snapshot} />
      <h2 className="animate-rise font-display text-xl font-black text-slate-900 sm:text-3xl">ตัวละครไหนมีทั้งสองอย่างนี้?</h2>
      <CluePair snapshot={snapshot} flip size="lg" />
      <p className="animate-pop font-display text-lg font-bold text-rose-500 sm:text-xl" style={{ animationDelay: '600ms' }}>
        เตรียมตัว… แข่งตอบกำลังจะเริ่ม! ⚡
      </p>
    </Card>
  );
}

// ------------------------------------------------------------------ 3. Race

function RaceStage({
  snapshot,
  receivedAt,
  draft,
  setDraft,
}: {
  snapshot: CharSnapshot;
  receivedAt: number;
  draft: Draft;
  setDraft: (d: Draft) => void;
}) {
  const { fieldError } = useChar();
  const charRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState(false);
  const me = snapshot.you.role;
  const info = CATEGORY_INFO[snapshot.settings.category];
  const canAnswer = snapshot.phase === 'RACING';

  const myRejected = useMemo(
    () => snapshot.attempts.filter((a) => a.by === me && a.verdict === 'disagreed'),
    [snapshot.attempts, me],
  );
  const check = checkAnswer(draft.character, draft.title, snapshot.usedCharacters, myRejected);
  // Warn about a used character as soon as the name is typed (before the title is filled in).
  const usedHit = findUsedCharacter(draft.character, snapshot.usedCharacters);
  const liveProblem = usedHit
    ? `"${usedHit.character}" ถูกใช้ไปแล้วในรอบที่ ${usedHit.round} — ห้ามตอบซ้ำทั้งเกม`
    : (draft.character.trim() || draft.title.trim()) && !check.ok && check.code !== 'EMPTY_FIELD'
      ? check.message
      : null;
  const shownError = liveProblem ?? fieldError?.message ?? null;

  useEffect(() => setSending(false), [snapshot.phase, snapshot.attempts.length, fieldError]);
  useEffect(() => {
    if (canAnswer && hasFinePointer()) (draft.character ? titleRef : charRef).current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAnswer]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!canAnswer || sending || !check.ok) return;
    setSending(true);
    charActions.submitAnswer(check.value.character, check.value.title);
  };

  const meP = snapshot.players.find((p) => p.role === me)!;
  const opp = snapshot.players.find((p) => p.role !== me);
  const disagreed = snapshot.attempts.filter((a) => a.verdict === 'disagreed');

  return (
    <Card className="space-y-5">
      <StageHeader snapshot={snapshot} right={<TimerBar snapshot={snapshot} receivedAt={receivedAt} />} />
      <h2 className="text-center font-display text-lg font-black text-slate-900 sm:text-2xl">ตัวละครไหนมีทั้งสองอย่างนี้?</h2>
      <CluePair snapshot={snapshot} />

      <form onSubmit={submit} noValidate className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">ชื่อตัวละคร</span>
            <input
              ref={charRef}
              value={draft.character}
              onChange={(e) => {
                setDraft({ ...draft, character: e.target.value });
                charActions.clearFieldError();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  if (draft.title.trim()) submit();
                  else titleRef.current?.focus();
                }
              }}
              disabled={!canAnswer}
              maxLength={MAX_CHARACTER_LENGTH * 2}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              placeholder={`เช่น ${info.answerExample.character}`}
              className="h-14 w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 font-display text-xl font-bold text-slate-800 outline-none transition placeholder:font-sans placeholder:text-base placeholder:font-normal placeholder:text-slate-400 focus:border-rose-400 focus:bg-white disabled:opacity-60"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">{info.titleLabel}</span>
            <input
              ref={titleRef}
              value={draft.title}
              onChange={(e) => {
                setDraft({ ...draft, title: e.target.value });
                charActions.clearFieldError();
              }}
              disabled={!canAnswer}
              maxLength={MAX_TITLE_LENGTH * 2}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="send"
              placeholder={`เช่น ${info.answerExample.title}`}
              className="h-14 w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 font-display text-xl font-bold text-slate-800 outline-none transition placeholder:font-sans placeholder:text-base placeholder:font-normal placeholder:text-slate-400 focus:border-rose-400 focus:bg-white disabled:opacity-60"
            />
          </label>
        </div>
        <p className={cx('min-h-5 text-sm', shownError ? 'font-medium text-rose-600' : 'text-slate-400')} role={shownError ? 'alert' : undefined}>
          {shownError ?? 'กรอกครบสองช่องแล้วกด “ตอบ!” — ใครกดก่อนได้สิทธิ์ อีกฝ่ายเป็นคนตัดสิน'}
        </p>
        <button
          type="submit"
          disabled={!canAnswer || !check.ok || sending}
          className={cx(
            'relative h-20 w-full rounded-[2rem] bg-linear-to-b from-rose-500 to-rose-600 font-display text-3xl font-black tracking-wide text-white transition sm:h-24 sm:text-4xl',
            'shadow-[0_10px_0_0_rgb(159,18,57)] active:translate-y-2 active:shadow-[0_2px_0_0_rgb(159,18,57)]',
            'disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-400 disabled:shadow-[0_10px_0_0_rgb(148,163,184)]',
            check.ok && canAnswer && 'animate-press',
          )}
        >
          ตอบ! ⚡
        </button>
      </form>

      {disagreed.length ? (
        <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-100">
          <p className="mb-2 text-xs font-semibold text-slate-500">คำตอบที่โดน Disagree ในรอบนี้</p>
          <div className="flex flex-wrap gap-1.5">
            {disagreed.map((a) => (
              <span key={a.id} className={cx('rounded-xl px-2.5 py-1 text-sm ring-1', CROLE[a.by].soft, CROLE[a.by].ring)}>
                <span className="font-semibold text-slate-500 line-through">{a.character}</span>
                <span className="text-xs text-slate-400"> · {a.title} · {nameOf(snapshot, a.by)}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col items-stretch gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-500">
          {opp?.wantsSkip && !meP.wantsSkip
            ? `${opp.name} ขอข้ามรอบ — กดเพื่อยืนยัน`
            : meP.wantsSkip
              ? `รอ ${opp?.name ?? 'อีกฝ่าย'} ยืนยันข้ามรอบ…`
              : 'คิดไม่ออกทั้งคู่? ข้ามรอบได้ถ้ากดทั้งสองคน'}
        </p>
        <Button
          variant={meP.wantsSkip ? 'secondary' : opp?.wantsSkip ? 'pop' : 'ghost'}
          size="md"
          disabled={!canAnswer}
          onClick={() => charActions.voteSkip(!meP.wantsSkip)}
          className="shrink-0"
        >
          {meP.wantsSkip ? 'ยกเลิกขอข้าม' : opp?.wantsSkip ? 'ยืนยันข้ามรอบ ⏭' : 'ขอข้ามรอบ ⏭'}
        </Button>
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ 4. Review

function ReviewStage({ snapshot, receivedAt }: { snapshot: CharSnapshot; receivedAt: number }) {
  const [sent, setSent] = useState(false);
  const pending = snapshot.pending;
  if (!pending) return null;
  const info = CATEGORY_INFO[snapshot.settings.category];
  const answerer = snapshot.players.find((p) => p.role === pending.by)!;
  const judge = snapshot.players.find((p) => p.role !== pending.by);
  const iJudge = snapshot.you.role !== pending.by;
  const judgeNow = (agree: boolean) => {
    if (sent) return;
    setSent(true);
    charActions.judge(agree);
  };

  return (
    <Card className="relative overflow-hidden text-center">
      <div className="pointer-events-none absolute inset-x-0 -top-28 mx-auto size-80 rounded-full bg-linear-to-br from-yellow-200/70 to-rose-200/70 blur-3xl" />
      <div className="relative space-y-5">
        <StageHeader snapshot={snapshot} right={<TimerBar snapshot={snapshot} receivedAt={receivedAt} />} />
        <div className="flex flex-col items-center">
          <CAvatar name={answerer.name} role={answerer.role} size="lg" />
          <p className="mt-2 font-display text-base font-bold text-slate-600">
            {iJudge ? `${answerer.name} ตอบว่า` : 'คุณตอบว่า'}
          </p>
        </div>
        <div className="mx-auto max-w-lg animate-buzz-in rounded-[2rem] bg-linear-to-br from-orange-500 via-rose-500 to-fuchsia-600 p-[3px] shadow-xl shadow-rose-500/30">
          <div className="rounded-[calc(2rem-3px)] bg-white px-5 py-6">
            <p className="font-display text-4xl leading-tight font-black wrap-anywhere text-slate-900 sm:text-5xl">{pending.character}</p>
            <p className="mt-2 font-display text-lg font-semibold text-rose-500 wrap-anywhere">จาก {pending.title}</p>
            <p className="text-xs text-slate-400">{info.th}</p>
          </div>
        </div>
        {snapshot.clues ? (
          <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
            <span className="text-slate-500">ตรงกับใบ้ไหม?</span>
            <span className="rounded-full bg-orange-50 px-3 py-1 font-semibold text-orange-700 ring-1 ring-orange-200">{snapshot.clues.A}</span>
            <span className="font-black text-rose-400">+</span>
            <span className="rounded-full bg-violet-50 px-3 py-1 font-semibold text-violet-700 ring-1 ring-violet-200">{snapshot.clues.B}</span>
          </div>
        ) : null}

        {iJudge ? (
          <div className="space-y-3">
            <p className="font-display text-xl font-black text-slate-800">คุณเห็นด้วยไหม?</p>
            <div className="mx-auto grid max-w-lg grid-cols-2 gap-3">
              <Button variant="agree" size="xl" className="h-20 flex-col gap-0 text-2xl sm:h-24" disabled={sent} onClick={() => judgeNow(true)}>
                <span aria-hidden="true">👍</span>
                <span className="text-lg sm:text-xl">Agree</span>
              </Button>
              <Button variant="disagree" size="xl" className="h-20 flex-col gap-0 text-2xl sm:h-24" disabled={sent} onClick={() => judgeNow(false)}>
                <span aria-hidden="true">👎</span>
                <span className="text-lg sm:text-xl">Disagree</span>
              </Button>
            </div>
            <p className="text-xs text-slate-400">Agree = {answerer.name} ได้ +1 แต้ม · Disagree = {answerer.name} แก้คำตอบได้ และคุณแข่งตอบต่อได้</p>
          </div>
        ) : (
          <div className="rounded-2xl bg-slate-50 px-4 py-4 ring-1 ring-slate-100">
            <p className="flex items-center justify-center gap-2 font-display text-lg font-bold text-slate-700">
              รอ {judge?.name ?? 'อีกฝ่าย'} ตัดสิน <ThinkingDots />
            </p>
            <p className="mt-1 text-xs text-slate-400">เวลาหยุดเดินระหว่างรอตัดสิน</p>
          </div>
        )}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ 5. Round result

function RoundEndStage({ snapshot }: { snapshot: CharSnapshot }) {
  const { verdict } = useChar();
  const o = snapshot.lastOutcome;
  if (!o) return null;
  if (o.type !== 'scored') {
    return (
      <Card className="py-10 text-center">
        <p className="animate-buzz-in text-6xl" aria-hidden="true">
          {o.type === 'timeout' ? '⏰' : '⏭'}
        </p>
        <h2 className="mt-3 font-display text-3xl font-black text-slate-900">{o.type === 'timeout' ? 'หมดเวลา!' : 'ข้ามรอบ'}</h2>
        <p className="mt-1 text-slate-500">ไม่มีใครได้แต้มในรอบนี้ — เตรียมใบ้รอบต่อไป</p>
      </Card>
    );
  }
  const p = snapshot.players.find((x) => x.role === o.by);
  const isMe = o.by === snapshot.you.role;
  const winning = (p?.score ?? 0) >= snapshot.settings.targetScore;
  return (
    <Card className="relative overflow-hidden py-8 text-center">
      <div className="quiz-rays warm pointer-events-none absolute" />
      <div className="relative">
        <p className={cx('animate-score font-display text-7xl font-black sm:text-8xl', CROLE[o.by].text)}>+1</p>
        <div className="mt-3 flex items-center justify-center gap-2">
          <CAvatar name={p?.name ?? o.by} role={o.by} size="md" />
          <p className="font-display text-2xl font-black text-slate-900">{isMe ? 'คุณได้แต้ม!' : `${p?.name} ได้แต้ม!`}</p>
        </div>
        <p className="mx-auto mt-4 max-w-md rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-100">
          <span className="font-display text-xl font-black text-slate-800">{o.character}</span>
          <span className="block text-sm text-slate-500">{o.title}</span>
        </p>
        {verdict?.agree ? (
          <p className="mt-3 text-sm font-semibold text-emerald-600">✓ {verdict.judgeName} เห็นด้วย</p>
        ) : null}
        <p className="mt-4 font-display text-base font-bold text-rose-500">
          {winning ? `🏆 ถึง ${snapshot.settings.targetScore} แต้มแล้ว!` : 'รอบต่อไปกำลังจะเริ่ม…'}
        </p>
      </div>
    </Card>
  );
}
