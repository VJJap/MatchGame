import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { RoomSnapshot } from '../../../shared/types';
import { MAX_WORD_LENGTH } from '../../../shared/types';
import { checkWord, normalizeWord } from '../../../shared/words';
import { OpponentAwayBanner, TopBar } from '../components/chrome';
import {
  CountdownOverlay,
  HistoryList,
  PlayerStatus,
  PromptWords,
  RevealOverlay,
  TimerRing,
  roundLabel,
} from '../components/game-parts';
import { IconClock, IconLock } from '../components/icons';
import { Button, Card, SectionTitle, ThinkingDots, WordChip, cx } from '../components/ui';
import { hasFinePointer } from '../lib/hooks';
import { actions, useGame } from '../lib/store';

const INPUT_PHASES = new Set(['INITIAL_INPUT', 'ROUND_INPUT', 'WAITING_FOR_READY']);

export function Game({ snapshot }: { snapshot: RoomSnapshot }) {
  const { receivedAt, timeoutSignal } = useGame();
  const { you, players, round, phase } = snapshot;
  const me = players.find((p) => p.id === you.id)!;
  const opp = players.find((p) => p.id !== you.id);

  return (
    <>
      <TopBar confirmLeave />
      <main className="mx-auto grid w-full grid-cols-1 max-w-6xl gap-4 px-4 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6 md:gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="space-y-4 md:space-y-5">
          <OpponentAwayBanner />
          <Card className="relative space-y-5 overflow-hidden sm:space-y-6">
            {/* Round + timer */}
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="inline-flex items-center rounded-full bg-indigo-100 px-3 py-1 font-display text-sm font-bold text-indigo-700 sm:text-base">
                  {roundLabel(round)}
                </span>
                <p className="mt-1.5 text-sm text-slate-500">
                  {round === 0 ? 'ทั้งคู่พิมพ์คำแรกของตัวเอง' : 'ทั้งคู่พิมพ์คำที่คิดว่าอีกฝ่ายจะพิมพ์เหมือนกัน'}
                </p>
              </div>
              <TimerRing snapshot={snapshot} receivedAt={receivedAt} />
            </div>

            <TimeoutBanner signal={timeoutSignal} />

            <PromptWords snapshot={snapshot} />

            <AnswerBox key={`${round}-${timeoutSignal}`} snapshot={snapshot} />

            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              <PlayerStatus player={me} isYou phase={phase} />
              {opp ? <PlayerStatus player={opp} isYou={false} phase={phase} /> : null}
            </div>
          </Card>
        </div>

        <aside className="grid gap-4 md:grid-cols-2 md:gap-5 lg:sticky lg:top-4 lg:grid-cols-1">
          <Card>
            <SectionTitle right={<span className="text-xs text-slate-400">{snapshot.history.length} ครั้ง</span>}>
              ประวัติคำตอบ
            </SectionTitle>
            <HistoryList snapshot={snapshot} compact />
          </Card>
          <Card>
            <SectionTitle>คำที่คุณใช้ไปแล้ว</SectionTitle>
            {you.usedWords.length ? (
              <div className="flex flex-wrap gap-1.5">
                {you.usedWords.map((w) => (
                  <WordChip key={w} word={w} role={you.role} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">ยังไม่มี</p>
            )}
            <p className="mt-3 text-xs leading-relaxed text-slate-400">
              ห้ามใช้คำของตัวเองซ้ำ แต่ใช้คำของอีกฝ่ายได้ · ต้องสะกดตรงกันทุกตัวอักษรจึงจะนับว่า MATCH
            </p>
          </Card>
        </aside>
      </main>

      <CountdownOverlay snapshot={snapshot} receivedAt={receivedAt} />
      <RevealOverlay snapshot={snapshot} />
    </>
  );
}

function TimeoutBanner({ signal }: { signal: number }) {
  const [visible, setVisible] = useState(false);
  const first = useRef(signal);
  useEffect(() => {
    if (signal === first.current) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 2800);
    return () => clearTimeout(t);
  }, [signal]);
  if (!visible) return null;
  return (
    <div
      key={signal}
      role="alert"
      className="flex animate-shake items-center justify-center gap-2 rounded-2xl bg-rose-500 px-4 py-3 font-display text-base font-semibold text-white shadow-lg shadow-rose-500/30 sm:text-lg"
    >
      <IconClock size={20} /> หมดเวลา! เริ่มรอบเดิมใหม่
    </div>
  );
}

function AnswerBox({ snapshot }: { snapshot: RoomSnapshot }) {
  const { answerError } = useGame();
  const { you, phase, round } = snapshot;
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const canType = INPUT_PHASES.has(phase) && you.lockedAnswer === null;

  const check = useMemo(() => checkWord(draft, you.usedWords), [draft, you.usedWords]);
  const liveProblem = draft.trim() && !check.ok && check.code !== 'EMPTY_ANSWER' ? check.message : null;

  // Release the "sending" state when the server answers (locked or error).
  useEffect(() => {
    setSending(false);
  }, [you.lockedAnswer, answerError]);

  useEffect(() => {
    if (canType && hasFinePointer()) inputRef.current?.focus();
  }, [canType]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!canType || sending || !check.ok) return;
    setSending(true);
    actions.lockWord(check.word);
  };

  if (you.lockedAnswer !== null) {
    return (
      <div className="animate-pop rounded-3xl bg-emerald-50 p-4 ring-1 ring-emerald-200 sm:p-5">
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-md shadow-emerald-500/30">
            <IconLock size={20} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-emerald-700">คุณล็อกคำตอบแล้ว (แก้ไขไม่ได้)</p>
            <p className="truncate font-display text-2xl font-bold text-emerald-900">{you.lockedAnswer}</p>
          </div>
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-emerald-800">
          {phase === 'COUNTDOWN' || phase === 'REVEAL' ? 'กำลังเปิดคำ…' : 'กำลังรออีกฝ่าย'} <ThinkingDots />
        </p>
      </div>
    );
  }

  const shownError = liveProblem ?? (answerError ? answerError.message : null);

  return (
    <form onSubmit={submit} className="space-y-2" noValidate>
      <label htmlFor="answer" className="sr-only">
        พิมพ์คำตอบ
      </label>
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <input
          id="answer"
          ref={inputRef}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            actions.clearAnswerError();
          }}
          disabled={!canType}
          maxLength={MAX_WORD_LENGTH * 3}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="done"
          placeholder={round === 0 ? 'พิมพ์คำแรกของคุณ…' : 'คำที่เชื่อมสองคำนี้…'}
          className={cx(
            'h-14 min-w-0 flex-1 rounded-2xl border-2 bg-slate-50 px-4 font-display text-xl font-semibold text-slate-800 outline-none transition placeholder:font-sans placeholder:text-base placeholder:font-normal placeholder:text-slate-400 focus:bg-white sm:h-16 sm:text-2xl',
            shownError ? 'border-rose-300 focus:border-rose-400' : 'border-slate-200 focus:border-indigo-400',
          )}
        />
        <Button
          type="submit"
          size="xl"
          className="sm:w-40"
          disabled={!canType || !check.ok || !normalizeWord(draft)}
          loading={sending}
        >
          Ready
        </Button>
      </div>
      <p
        className={cx('min-h-5 text-sm', shownError ? 'font-medium text-rose-600' : 'text-slate-400')}
        role={shownError ? 'alert' : undefined}
      >
        {shownError ?? 'คำตอบจะถูกซ่อนจนกว่าทั้งคู่จะกด Ready · กด Ready แล้วแก้ไม่ได้'}
      </p>
    </form>
  );
}
