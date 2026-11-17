import { deactivateCharacter } from '../character/store';
import { goTo } from '../lib/nav';
import { deactivateWord } from '../lib/store';

/** "← เลือกเกม" link shown on each game's home screen. */
export function BackToPicker() {
  return (
    <button
      type="button"
      onClick={() => {
        deactivateWord();
        deactivateCharacter();
        goTo('picker');
      }}
      className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-white/15 px-3.5 font-display text-sm font-semibold text-white ring-1 ring-white/25 backdrop-blur transition hover:bg-white/25"
    >
      <span aria-hidden="true">←</span> เลือกเกม
    </button>
  );
}
