// siman-pruebas/correr.mjs  (dueño: P1)
// Las pruebas viven aparte de la app (no van en lo que se publica en trazzasv). Este comando las copia dentro de
// la app (siman-logistica en la PC, Trazza en el repositorio), corre lo pedido y las vuelve a sacar.
// Uso (desde cualquier carpeta):
//   node ../siman-pruebas/correr.mjs unidad            pruebas unitarias (Jest, datos de prueba)
//   node ../siman-pruebas/correr.mjs emulador          pruebas contra los emuladores (npm run emulators antes)
//   node ../siman-pruebas/correr.mjs navegador         la demo con login contra los emuladores (emulatorRun)
//   node ../siman-pruebas/correr.mjs emuladores        arranca los emuladores de Firebase (Firestore, Storage y Auth)
//   node ../siman-pruebas/correr.mjs reglas            revisa las reglas en la nube real (check:cloud)
//   node ../siman-pruebas/correr.mjs humo              chequeo de humo en trazzasv
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// En la PC la app está en ../siman-logistica; en el repositorio, en ../Trazza
const project = resolve(
  process.env.SIMAN_PROYECTO ?? [join(here, '..', 'siman-logistica'), join(here, '..', 'Trazza')].find(existsSync) ?? '',
);
const PIECES = [
  '__tests__',
  '__integration__',
  'scripts/e2e',
  'scripts/cloud/smoke.mjs',
  'scripts/cloud/checkRules.mjs',
  'jest.setup.js',
  'jest.emulator.config.js',
  'jest.config.js',
  'firebase.json',
  'firebase.auth-emu.json',
  'firestore.rules',
  'storage.rules',
  'scripts/seed.js',
  'scripts/make-orders-xlsx.js',
  'assets/pedidos-prueba-100.xlsx',
];

const [what, ...rest] = process.argv.slice(2);
const commands = {
  unidad: [['npx', ['jest', '--silent']]],
  emulador: [['npx', ['jest', '-c', 'jest.emulator.config.js']]],
  navegador: [['node', ['scripts/e2e/emulatorRun.mjs']]],
  emuladores: [['npx', ['firebase', 'emulators:start', '--only', 'firestore,storage,auth', '--project', 'demo-siman-logistica']]],
  reglas: [['node', ['scripts/cloud/checkRules.mjs']]],
  humo: [['node', ['scripts/cloud/smoke.mjs', ...rest]]],
};
if (!commands[what]) {
  console.error('Uso: node correr.mjs unidad | emulador | navegador | emuladores | reglas | humo');
  process.exit(2);
}

// Con "jest" en package.json, un jest.config.js aparte confunde a Jest: solo se copia si no está
const pkg = JSON.parse(readFileSync(join(project, 'package.json'), 'utf8'));
const pieces = PIECES.filter((p) => !(p === 'jest.config.js' && pkg.jest));

const copied = [];
let status = 1;
try {
  for (const p of pieces) {
    const to = join(project, p);
    if (existsSync(to)) continue; // ya está en el proyecto: se usa esa y no se borra
    cpSync(join(here, p), to, { recursive: true });
    copied.push(to);
  }
  for (const [cmd, args] of commands[what]) {
    const r = spawnSync(cmd, args, { cwd: project, stdio: 'inherit', shell: process.platform === 'win32' });
    status = r.status ?? 1;
    if (status !== 0) break;
  }
} finally {
  for (const to of copied.reverse()) rmSync(to, { recursive: true, force: true });
}
process.exit(status);
