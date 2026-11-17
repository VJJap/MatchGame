import { useEffect } from 'react';
import { CharacterApp } from './character/CharacterApp';
import { Backdrop, ConnectionBanner, Toasts } from './components/chrome';
import { Logo, Spinner } from './components/ui';
import { resolveRoomParam, useScreen } from './lib/nav';
import { activateWord, useGame } from './lib/store';
import { toast } from './lib/toast';
import { GamePicker } from './picker/GamePicker';
import { Game } from './pages/Game';
import { Home } from './pages/Home';
import { Lobby } from './pages/Lobby';
import { Victory } from './pages/Victory';

export default function App() {
  const screen = useScreen();

  // Old-style links (?room=CODE without ?game=) are routed to whichever game owns the code.
  useEffect(() => {
    void resolveRoomParam().then((r) => {
      if (r && !r.ok) toast(r.message, 'warn', 5000);
    });
  }, []);

  return (
    <div className="relative min-h-dvh pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
      <Backdrop theme={screen} />
      {screen === 'picker' ? <GamePicker /> : screen === 'word' ? <WordApp /> : <CharacterApp />}
      <Toasts />
    </div>
  );
}

/** Match Word (the first game). */
function WordApp() {
  useEffect(() => activateWord(), []);
  const { snapshot, pending, conn, session } = useGame();

  let view;
  if (!snapshot) {
    view = pending === 'restore' ? <Restoring /> : <Home />;
  } else if (snapshot.phase === 'WAITING_FOR_PLAYERS' || snapshot.phase === 'LOBBY') {
    view = <Lobby snapshot={snapshot} />;
  } else if (snapshot.phase === 'GAME_OVER') {
    view = <Victory snapshot={snapshot} />;
  } else {
    view = <Game snapshot={snapshot} />;
  }

  return (
    <>
      {view}
      <ConnectionBanner conn={conn} active={Boolean(snapshot || session)} />
    </>
  );
}

function Restoring() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 text-white">
      <Logo className="size-16 animate-tick drop-shadow-xl" />
      <p className="flex items-center gap-2 font-display text-lg">
        <Spinner /> กำลังกลับเข้าห้อง…
      </p>
    </div>
  );
}
