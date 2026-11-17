import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { unlockAudio } from './lib/sound';
import './lib/store'; // registers socket listeners once

// Browsers (esp. iOS Safari) only allow audio after a user gesture.
for (const ev of ['pointerdown', 'keydown', 'touchend'] as const) {
  window.addEventListener(ev, unlockAudio, { passive: true });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
