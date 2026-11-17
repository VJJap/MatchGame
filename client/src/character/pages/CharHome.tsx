import { useEffect, useState, type FormEvent } from 'react';
import { DEFAULT_CHAR_SETTINGS, type CharSettings } from '../../../../shared/character';
import { MAX_NAME_LENGTH, ROOM_CODE_LENGTH } from '../../../../shared/types';
import { isValidName, normalizeName, normalizeRoomCode } from '../../../../shared/words';
import { BackToPicker } from '../../picker/BackToPicker';
import { Button, Card, SoundToggle, cx } from '../../components/ui';
import { loadName } from '../../lib/storage';
import { AnswerTimePicker, CategoryPicker, CharLogo, TargetPicker } from '../parts';
import { charActions, useChar } from '../store';

type Tab = 'create' | 'join';

export function CharHome() {
  const { pending, formError, prefillCode, conn } = useChar();
  const [tab, setTab] = useState<Tab>(prefillCode ? 'join' : 'create');
  const [name, setName] = useState(loadName);
  const [settings, setSettings] = useState<CharSettings>(DEFAULT_CHAR_SETTINGS);
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
    if (tab === 'create') charActions.createRoom(cleanName, settings);
    else if (codeOk) charActions.joinRoom(code, cleanName);
  };

  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6 md:gap-8 md:pt-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-12 lg:pt-12">
      {/* ---------------- Hero ---------------- */}
      <section className="text-white">
        <div className="flex items-center justify-between gap-3">
          <BackToPicker />
          <div className="lg:hidden">
            <SoundToggle />
          </div>
        </div>
        <CharLogo className="mt-5 size-16 animate-wiggle drop-shadow-xl sm:size-20" />
        <h1 className="mt-4 font-display text-5xl leading-[0.95] font-black tracking-tight drop-shadow-[0_4px_0_rgba(136,19,55,0.35)] sm:text-6xl lg:text-7xl">
          <span className="block">Match</span>
          <span className="block text-yellow-200">Character</span>
        </h1>
        <p className="mt-2 font-display text-lg font-semibold text-white/90 sm:text-xl">ทายตัวละครจากลักษณะเด่น</p>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-white/85 sm:text-lg">
          ต่างคนต่างใบ้ลักษณะเด่น 1 อย่าง แล้วแข่งกันหาตัวละครที่มีทั้งสองอย่าง — ใครตอบก่อนและอีกฝ่ายยอมรับ ได้แต้ม!
        </p>

        <div className="mt-6 hidden gap-2.5 md:flex md:flex-wrap">
          {[
            ['🤫', 'ใบ้แบบลับ'],
            ['⚡', 'แข่งกด “ตอบ!”'],
            ['👍', 'Agree / Disagree'],
            ['🏆', 'ถึงเป้าก่อนชนะ'],
          ].map(([e, t]) => (
            <span
              key={t}
              className="flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 font-display text-sm font-semibold ring-1 ring-white/25 backdrop-blur"
            >
              <span aria-hidden="true">{e}</span> {t}
            </span>
          ))}
        </div>
      </section>

      {/* ---------------- Form ---------------- */}
      <Card className="mx-auto w-full max-w-xl p-5 sm:p-7 lg:max-w-none">
        <div className="mb-4 hidden justify-end lg:flex">
          <SoundToggle tone="dark" />
        </div>
        <form onSubmit={submit} noValidate className="space-y-5">
          <div>
            <label htmlFor="c-name" className="mb-1.5 block text-sm font-semibold text-slate-700">
              ชื่อผู้เล่น
            </label>
            <input
              id="c-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                charActions.clearFormError();
              }}
              maxLength={MAX_NAME_LENGTH + 10}
              autoComplete="nickname"
              enterKeyHint="go"
              placeholder="เช่น มิ้นท์"
              className={cx(
                'h-13 w-full rounded-2xl border-2 bg-slate-50 px-4 text-lg outline-none transition focus:bg-white',
                touched && !nameOk ? 'border-rose-300 focus:border-rose-400' : 'border-slate-200 focus:border-rose-400',
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
                  charActions.clearFormError();
                }}
                className={cx(
                  'h-11 rounded-xl font-display text-[15px] font-bold transition',
                  tab === key ? 'bg-white text-rose-600 shadow' : 'text-slate-500 hover:text-slate-700',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'create' ? (
            <div className="animate-rise space-y-4">
              <Field label="หมวดหมู่">
                <CategoryPicker value={settings.category} onChange={(category) => setSettings((s) => ({ ...s, category }))} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
                <Field label="แต้มเป้าหมาย">
                  <TargetPicker value={settings.targetScore} onChange={(targetScore) => setSettings((s) => ({ ...s, targetScore }))} />
                </Field>
                <Field label="เวลาหาคำตอบต่อรอบ">
                  <AnswerTimePicker
                    value={settings.answerSeconds}
                    onChange={(answerSeconds) => setSettings((s) => ({ ...s, answerSeconds }))}
                  />
                </Field>
              </div>
            </div>
          ) : (
            <div className="animate-rise">
              <label htmlFor="c-code" className="mb-1.5 block text-sm font-semibold text-slate-700">
                รหัสห้อง (6 ตัว)
              </label>
              <input
                id="c-code"
                value={code}
                onChange={(e) => {
                  setCode(normalizeRoomCode(e.target.value).slice(0, ROOM_CODE_LENGTH));
                  charActions.clearFormError();
                }}
                autoCapitalize="characters"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="go"
                placeholder="ABC123"
                className="h-14 w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 text-center font-display text-2xl font-black tracking-[0.4em] text-rose-700 uppercase outline-none transition placeholder:text-slate-300 focus:border-rose-400 focus:bg-white"
              />
            </div>
          )}

          {formError ? (
            <p role="alert" className="animate-shake rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-700">
              {formError}
            </p>
          ) : null}

          <Button type="submit" variant="pop" size="xl" className="w-full" loading={busy} disabled={offline || (tab === 'join' && !codeOk)}>
            {tab === 'create' ? 'สร้างห้อง' : 'เข้าร่วมห้อง'}
          </Button>
          {offline ? <p className="text-center text-sm text-slate-500">กำลังเชื่อมต่อเซิร์ฟเวอร์…</p> : null}
        </form>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-slate-700">{label}</p>
      {children}
    </div>
  );
}
