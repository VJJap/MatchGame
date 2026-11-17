import { useState, type FormEvent, type ReactNode } from 'react';
import type { GameKind } from '../../../shared/character';
import { ROOM_CODE_LENGTH } from '../../../shared/types';
import { normalizeRoomCode } from '../../../shared/words';
import { CharLogo } from '../character/parts';
import { Button, Logo, SoundToggle, cx } from '../components/ui';
import { goTo, lookupRoom } from '../lib/nav';

export function GamePicker() {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const join = async (e: FormEvent) => {
    e.preventDefault();
    if (code.length !== ROOM_CODE_LENGTH || busy) return;
    setBusy(true);
    setError(null);
    const r = await lookupRoom(code);
    setBusy(false);
    if (!r.ok) return setError(r.message);
    if (r.full) return setError('ห้องนี้มีผู้เล่นครบ 2 คนแล้ว');
    goTo(r.game, r.code); // the game's home opens on "join" with the code filled in
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6 lg:pt-10">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="relative h-12 w-16 shrink-0">
            <Logo className="absolute top-0 left-0 size-11 -rotate-6 drop-shadow-lg" />
            <CharLogo className="absolute top-1 left-5 size-11 rotate-6 drop-shadow-lg" />
          </span>
          <div className="leading-tight text-white">
            <p className="font-display text-xl font-black tracking-wide">MatchGame</p>
            <p className="text-xs text-white/60">ปาร์ตี้เกมสำหรับ 2 คน</p>
          </div>
        </div>
        <SoundToggle />
      </header>

      <section className="mt-8 text-white sm:mt-12">
        <h1 className="font-display text-4xl leading-tight font-black sm:text-5xl lg:text-6xl">เลือกเกมที่จะเล่น</h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-white/70 sm:text-lg">
          เล่นกับเพื่อนได้ทั้งบนมือถือ, iPad และคอมพิวเตอร์คนละเครื่อง — สร้างห้อง แล้วส่งลิงก์ให้เพื่อนกดเข้ามา
        </p>
      </section>

      <div className="mt-7 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5 lg:mt-10 lg:gap-6">
        <GameCard
          game="word"
          gradient="from-violet-600 via-indigo-600 to-blue-600"
          shadow="shadow-indigo-950/50"
          logo={<Logo className="size-14 drop-shadow-lg sm:size-16" />}
          title="Match Word"
          thai="พิมพ์จนกว่าคำจะตรงกัน"
          description="ต่างคนพิมพ์คำแล้วเปิดพร้อมกัน หาคำ “ตรงกลาง” ระหว่างสองคำล่าสุดไปเรื่อย ๆ จนกว่าจะคิดตรงกัน"
          tags={['ร่วมมือกัน', 'เชื่อมคำ', 'ใจตรงกัน']}
          illustration={<WordIllustration />}
          cta="เล่น Match Word"
        />
        <GameCard
          game="character"
          gradient="from-orange-500 via-rose-500 to-fuchsia-600"
          shadow="shadow-rose-950/50"
          logo={<CharLogo className="size-14 drop-shadow-lg sm:size-16" />}
          title="MatchCharacter"
          thai="ทายตัวละครจากลักษณะเด่น"
          description="ใบ้ลักษณะเด่นคนละอย่าง แล้วแข่งกันหาตัวละครที่มีทั้งสองอย่าง ใครกดตอบก่อนและอีกฝ่าย Agree ได้แต้ม"
          tags={['แข่งกัน', 'อนิเมะ · ซีรีส์ · หนัง', 'Quiz Show']}
          illustration={<CharacterIllustration />}
          cta="เล่น MatchCharacter"
        />
      </div>

      <form
        onSubmit={join}
        className="mx-auto mt-6 flex max-w-2xl flex-col gap-3 rounded-3xl bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur sm:mt-8 sm:flex-row sm:items-center sm:p-5"
      >
        <div className="min-w-0 flex-1">
          <label htmlFor="pick-code" className="block font-display text-sm font-bold text-white">
            มีรหัสห้องแล้ว?
          </label>
          <p className="text-xs text-white/60">ใส่รหัส 6 ตัว ระบบจะพาไปเกมที่ถูกต้องให้เอง</p>
        </div>
        <input
          id="pick-code"
          value={code}
          onChange={(e) => {
            setCode(normalizeRoomCode(e.target.value).slice(0, ROOM_CODE_LENGTH));
            setError(null);
          }}
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          placeholder="ABC123"
          aria-label="รหัสห้อง"
          className="h-13 w-full rounded-2xl border-2 border-white/20 bg-white/95 px-4 text-center font-display text-xl font-black tracking-[0.35em] text-slate-800 uppercase outline-none transition placeholder:text-slate-300 focus:border-white sm:w-48"
        />
        <Button type="submit" variant="white" size="lg" loading={busy} disabled={code.length !== ROOM_CODE_LENGTH} className="sm:w-32">
          เข้าห้อง
        </Button>
        {error ? (
          <p role="alert" className="animate-shake text-sm font-medium text-rose-200 sm:basis-full">
            {error}
          </p>
        ) : null}
      </form>
    </div>
  );
}

function GameCard({
  game,
  gradient,
  shadow,
  logo,
  title,
  thai,
  description,
  tags,
  illustration,
  cta,
}: {
  game: GameKind;
  gradient: string;
  shadow: string;
  logo: ReactNode;
  title: string;
  thai: string;
  description: string;
  tags: string[];
  illustration: ReactNode;
  cta: string;
}) {
  return (
    <button
      type="button"
      onClick={() => goTo(game, null)}
      className={cx(
        'group relative flex flex-col overflow-hidden rounded-[2rem] bg-linear-to-br p-5 text-left text-white shadow-2xl ring-1 ring-white/20 transition duration-200 sm:p-7',
        'hover:-translate-y-1 hover:shadow-[0_30px_60px_-20px] focus-visible:ring-4 focus-visible:ring-white/60 focus-visible:outline-none active:translate-y-0',
        gradient,
        shadow,
      )}
    >
      <div className="pointer-events-none absolute -top-20 -right-20 size-64 rounded-full bg-white/15 blur-2xl transition group-hover:scale-110" />
      <div className="relative flex items-start justify-between gap-4">
        {logo}
        <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold ring-1 ring-white/30">2 ผู้เล่น</span>
      </div>
      <h2 className="relative mt-5 font-display text-3xl leading-tight font-black sm:text-4xl">{title}</h2>
      <p className="relative font-display text-base font-semibold text-white/85 sm:text-lg">{thai}</p>
      <p className="relative mt-3 text-sm leading-relaxed text-white/80 sm:text-[15px]">{description}</p>
      <div className="relative mt-4 flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <span key={t} className="rounded-full bg-black/15 px-2.5 py-1 text-xs font-medium text-white/90">
            {t}
          </span>
        ))}
      </div>
      <div className="relative mt-5 flex-1">{illustration}</div>
      <span className="relative mt-5 inline-flex h-13 items-center justify-center gap-2 rounded-2xl bg-white font-display text-base font-bold text-slate-800 shadow-lg transition group-hover:gap-3">
        {cta} <span aria-hidden="true">→</span>
      </span>
    </button>
  );
}

function WordIllustration() {
  return (
    <div className="flex items-center justify-center gap-2 rounded-2xl bg-black/15 p-4" aria-hidden="true">
      <span className="rounded-2xl bg-white px-3 py-2 font-display font-bold text-violet-700 shadow">กาแฟ</span>
      <span className="text-white/70">+</span>
      <span className="rounded-2xl bg-white px-3 py-2 font-display font-bold text-blue-700 shadow">โรงเรียน</span>
      <span className="text-white/70">→</span>
      <span className="rounded-2xl bg-emerald-400 px-3 py-2 font-display font-black text-white shadow">ง่วง ✓</span>
    </div>
  );
}

function CharacterIllustration() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 rounded-2xl bg-black/15 p-4" aria-hidden="true">
      <span className="rounded-full bg-white px-3 py-1.5 font-display text-sm font-bold text-orange-600 shadow">ผมสีทอง</span>
      <span className="text-white/70">+</span>
      <span className="rounded-full bg-white px-3 py-1.5 font-display text-sm font-bold text-violet-600 shadow">มีพลังพิเศษ</span>
      <span className="text-white/70">=</span>
      <span className="rounded-2xl bg-yellow-300 px-3 py-1.5 font-display text-sm font-black text-rose-700 shadow">ตอบ! ⚡</span>
    </div>
  );
}
