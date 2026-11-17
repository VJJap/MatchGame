import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGameServer } from './app';

const here = path.dirname(fileURLToPath(import.meta.url));
// In dev (`--dev`), PORT usually belongs to the Vite dev server, so use SERVER_PORT / 3001
// (Vite proxies /socket.io there). In production, hosting platforms provide PORT.
const isDev = process.argv.includes('--dev');
const PORT = Number((isDev ? process.env.SERVER_PORT : (process.env.PORT ?? process.env.SERVER_PORT)) ?? 3001);
const HOST = process.env.HOST ?? '0.0.0.0';
const corsOrigins = (process.env.CLIENT_ORIGIN ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
// server/src and server/dist are both two levels below the repo root.
const staticDir = process.env.STATIC_DIR ?? path.resolve(here, '../../client/dist');

const { httpServer, close } = createGameServer({ corsOrigins, staticDir });

httpServer.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `\n  ✖ Port ${PORT} is already in use — is another "npm run dev" / "npm start" still running?\n` +
        `    Stop it first, or pick another port with ${isDev ? 'SERVER_PORT' : 'PORT'}=<port>.\n`,
    );
    process.exit(1);
  }
  throw err;
});

httpServer.listen(PORT, HOST, () => {
  console.log(`\n  🎮 MatchGame server running (Match Word + MatchCharacter)`);
  console.log(`  ➜ Local:   http://localhost:${PORT}`);
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) console.log(`  ➜ Network: http://${a.address}:${PORT}`);
    }
  }
  console.log('');
});

const shutdown = () => {
  void close().finally(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
