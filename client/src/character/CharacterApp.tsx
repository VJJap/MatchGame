import { useEffect } from 'react';
import { ConnectionBanner } from '../components/chrome';
import { Spinner } from '../components/ui';
import { CharGame } from './pages/CharGame';
import { CharHome } from './pages/CharHome';
import { CharLobby } from './pages/CharLobby';
import { CharVictory } from './pages/CharVictory';
import { CharLogo } from './parts';
import { activateCharacter, useChar } from './store';

export function CharacterApp() {
  useEffect(() => activateCharacter(), []);
  const { snapshot, pending, conn, session } = useChar();

  let view;
  if (!snapshot) view = pending === 'restore' ? <Restoring /> : <CharHome />;
  else if (snapshot.phase === 'WAITING_FOR_PLAYERS' || snapshot.phase === 'LOBBY') view = <CharLobby snapshot={snapshot} />;
  else if (snapshot.phase === 'GAME_OVER') view = <CharVictory snapshot={snapshot} />;
  else view = <CharGame snapshot={snapshot} />;

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
      <CharLogo className="size-16 animate-tick drop-shadow-xl" />
      <p className="flex items-center gap-2 font-display text-lg">
        <Spinner /> กำลังกลับเข้าห้อง…
      </p>
    </div>
  );
}
