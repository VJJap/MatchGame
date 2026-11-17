import { useEffect, useState, type FormEvent } from 'react';
import { DEFAULT_TIMER_SECONDS, MAX_NAME_LENGTH, ROOM_CODE_LENGTH, TIMER_OPTIONS, type TimerSeconds } from '../../../shared/types';
import { isValidName, normalizeName, normalizeRoomCode } from '../../../shared/words';
import { IconClock, IconUsers } from '../components/icons';
import { Button, Card, Logo, SoundToggle, cx } from '../components/ui';
import { BackToPicker } from '../picker/BackToPicker';
import { actions, useGame } from '../lib/store';
import { loadName } from '../lib/storage';

type Tab = 'create' | 'join';

export function Home() {
  const { pending, formError, prefillCode, conn } = useGame();
  const [tab, setTab] = useState<Tab>(prefillCode ? 'join' : 'create');
  const [name, setName] = useState(loadName);
  const [timer, setTimer] = useState<TimerSeconds>(DEFAULT_TIMER_SECONDS);
  const [code, setCode] = useState(prefillCode);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (prefillCode) {
      setTab('join');
      setCode(prefillCode);
    }
  }, [prefillCode]);

  const cleanName = normalizeName(name);
  const nameOk = isValidName(cleanName);
  const codeOk = code.length === ROOM_CODE_LENGTH;
  const busy = pending === 'create' || pending === 'join';
  const offline = conn !== 'connected';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!nameOk || busy) return;
    if (tab === 'create') actions.createRoom(cleanName, timer);
    else if (codeOk) actions.joinRoom(code, cleanName);
  };

  return (
    <div className="mx-auto grid w-full grid-cols-1 max-w-6xl gap-6 px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6 md:gap-8 md:pt-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-center lg:gap-14 lg:pt-16">
      {/* ---------------- Hero ---------------- */}
      <section className="text-white lg:row-span-2">
        <div className="flex items-center justify-between gap-3">
          <BackToPicker />
          <div className="lg:hidden">
            <SoundToggle />
          </div>
        </div>
        <Logo className="mt-5 size-14 drop-shadow-xl sm:size-16 lg:size-20" />
        <h1 className="mt-4 font-display text-[2rem] leading-tight font-extrabold sm:text-5xl lg:mt-6 lg:text-6xl">
          พิมพ์จนกว่า
          <br className="hidden sm:block" />
          <span className="bg-linear-to-r from-fuchsia-200 via-white to-sky-200 bg-clip-text text-transparent">
            คำจะตรงกัน
          </span>
        </h1>
        <p className="mt-1 font-display text-base font-medium text-white/70 sm:text-lg">Type Until We Match</p>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-white/85 sm:text-lg">
          เกมเชื่อมคำสำหรับ 2 คน ต่างคนต่างพิมพ์ แล้วเปิดคำพร้อมกัน — หาคำที่อยู่ “ตรงกลาง” ระหว่างสองคำล่าสุด
          ไปเรื่อย ๆ จนกว่าจะคิดตรงกัน
        </p>

        <ol className="mt-6 hidden gap-3 md:grid md:grid-cols-3 lg:mt-10 lg:grid-cols-1 xl:grid-cols-3">
          {[
            ['1', 'เปิดเกม', 'พิมพ์คำอะไรก็ได้ คนละคำ'],
            ['2', 'หาคำตรงกลาง', 'เชื่อมโยงสองคำล่าสุด'],
            ['3', 'Ready พร้อมกัน', 'นับ 3-2-1 แล้วเปิดคำ'],
          ].map(([n, t, d]) => (
            <li key={n} className="flex items-center gap-3 rounded-2xl bg-white/10 p-3.5 ring-1 ring-white/20 backdrop-blur">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white font-display font-bold text-indigo-700">
                {n}
              </span>
              <div className="leading-tight">
                <p className="font-display font-semibold">{t}</p>
                <p className="mt-0.5 text-sm text-white/75">{d}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------------- Form ---------------- */}
      <Card className="mx-auto w-full max-w-xl p-5 sm:p-8 lg:max-w-none">
        <div className="mb-5 hidden justify-end lg:flex">
          <SoundToggle tone="dark" />
        </div>
        <form onSubmit={submit} noValidate className="space-y-5">
          <div>
            <label htmlFor="name" className="mb-1.5 block text-sm font-semibold text-slate-700">
              ชื่อผู้เล่น
            </label>
            <input
              id="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                actions.clearFormError();
              }}
              maxLength={MAX_NAME_LENGTH + 10}
              autoComplete="nickname"
              enterKeyHint="go"
              placeholder="เช่น มิ้นท์"
              className={cx(
                'h-13 w-full rounded-2xl border-2 bg-slate-50 px-4 text-lg outline-none transition focus:bg-white',
                touched && !nameOk ? 'border-rose-300 focus:border-rose-400' : 'border-slate-200 focus:border-indigo-400',
              )}
            />
            {touched && !nameOk ? (
              <p className="mt-1.5 text-sm text-rose-600">กรุณากรอกชื่อ (1–{MAX_NAME_LENGTH} ตัวอักษร)</p>
            ) : null}
          </div>

          <div role="tablist" aria-label="เลือกโหมด" className="grid grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1">
            {(
              [
                ['create', 'สร้างห้อง'],
                ['join', 'เข้าร่วมห้อง'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => {
                  setTab(key);
                  actions.clearFormError();
                }}
                className={cx(
                  'h-11 rounded-xl font-display text-[15px] font-semibold transition',
                  tab === key ? 'bg-white text-indigo-700 shadow' : 'text-slate-500 hover:text-slate-700',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'create' ? (
            <div className="animate-rise">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <IconClock size={16} className="text-indigo-500" /> เวลาคิดต่อรอบ
              </p>
              <TimerPicker value={timer} onChange={setTimer} />
            </div>
          ) : (
            <div className="animate-rise">
              <label htmlFor="code" className="mb-1.5 block text-sm font-semibold text-slate-700">
                รหัสห้อง (6 ตัว)
              </label>
              <input
                id="code"
                value={code}
                onChange={(e) => {
                  setCode(normalizeRoomCode(e.target.value).slice(0, ROOM_CODE_LENGTH));
                  actions.clearFormError();
                }}
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="go"
                placeholder="ABC123"
                className="h-14 w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 text-center font-display text-2xl font-bold tracking-[0.4em] text-indigo-900 uppercase outline-none transition placeholder:text-slate-300 focus:border-indigo-400 focus:bg-white"
              />
            </div>
          )}

          {formError ? (
            <p role="alert" className="animate-shake rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-700">
              {formError}
            </p>
          ) : null}

          <Button
            type="submit"
            size="xl"
            className="w-full"
            loading={busy}
            disabled={offline || (tab === 'join' && !codeOk)}
          >
            {tab === 'create' ? 'สร้างห้อง' : 'เข้าร่วมห้อง'}
          </Button>
          {offline ? <p className="text-center text-sm text-slate-500">กำลังเชื่อมต่อเซิร์ฟเวอร์…</p> : null}
        </form>

        <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-xs text-slate-400">
          <IconUsers size={14} /> เล่นได้ 2 คน · ใช้มือถือ, iPad หรือคอมพิวเตอร์คนละเครื่อง
        </p>
      </Card>
    </div>
  );
}

export function TimerPicker({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (t: TimerSeconds) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-5 gap-1.5 sm:gap-2" role="radiogroup" aria-label="เวลาต่อรอบ">
      {TIMER_OPTIONS.map((t) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={value === t}
          disabled={disabled}
          onClick={() => onChange(t)}
          className={cx(
            'flex h-14 flex-col items-center justify-center rounded-2xl font-display leading-none transition disabled:cursor-not-allowed',
            value === t
              ? 'bg-linear-to-br from-violet-600 to-blue-600 text-white shadow-lg shadow-indigo-500/30'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:hover:bg-slate-100',
            disabled && value !== t && 'opacity-50',
          )}
        >
          <span className="text-lg font-bold">{t}</span>
          <span className={cx('mt-1 text-[10px]', value === t ? 'text-white/80' : 'text-slate-400')}>วินาที</span>
        </button>
      ))}
    </div>
  );
}
