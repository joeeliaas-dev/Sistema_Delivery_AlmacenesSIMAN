// scripts/e2e/emulatorRun.mjs  (dueño: P1)
// La demo como usuario, pero con la app conectada al emulador (sin mocks): compila la web
// con EXPO_PUBLIC_USE_MOCKS=false, la sirve, reinicia el seed y corre demoPhone.mjs.
// Requiere `npm run emulators` corriendo en otra terminal.
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const run = (cmd, args, env = {}) => {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, ...env } });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

// --clear: la caché de Metro guarda el valor viejo de EXPO_PUBLIC_USE_MOCKS
run('npx', ['expo', 'export', '--platform', 'web', '--output-dir', 'dist-emu', '--clear'], { EXPO_PUBLIC_USE_MOCKS: 'false' });
run('node', ['scripts/seed.js', '--reset']);

const server = spawn(process.execPath, [join(root, 'scripts/e2e/serve.mjs'), join(root, 'dist-emu'), '8090'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1000));
const e2e = spawnSync(process.execPath, [join(root, 'scripts/e2e/demoPhone.mjs'), 'http://localhost:8090'], { cwd: root, stdio: 'inherit' });
server.kill();
process.exit(e2e.status ?? 1);
