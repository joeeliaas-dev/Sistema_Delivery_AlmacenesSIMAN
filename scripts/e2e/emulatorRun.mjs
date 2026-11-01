// scripts/e2e/emulatorRun.mjs  (dueño: P1)
// La demo como usuario contra los emuladores, CON login y las reglas de la NUBE (C48):
// compila la web sin mocks ni Geoapify real, reinicia el seed, crea las cuentas de prueba y su users/{uid},
// carga firestore.cloud.rules, sirve la app, corre demoPhone.mjs (entra por la pantalla de login y cambia de
// persona cerrando sesión) y al final vuelve a dejar firestore.rules.
// Requiere en otras terminales: `npm run emulators` (Firestore 8080) y `npm run emulators:auth` (Auth 9099).
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const req = createRequire(join(root, 'package.json'));
const PASSWORD = 'trazza-prueba'; // solo emulador (DEMO_PASSWORD de src/lib/auth.js)
// Proyecto propio del emulador: el seed --reset borra todo, así no toca el de quien esté probando a mano
const project = 'demo-e2e-siman';
const run = (cmd, args, env = {}) => {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, ...env } });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

// --clear: la caché de Metro guarda el valor viejo de EXPO_PUBLIC_USE_MOCKS
run('npx', ['expo', 'export', '--platform', 'web', '--output-dir', 'dist-emu', '--clear'], {
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: project,
  EXPO_PUBLIC_USE_MOCKS: 'false',
  EXPO_PUBLIC_GEOAPIFY_LIVE: 'false',
  EXPO_PUBLIC_GEOAPIFY_KEY: '',
});
run('node', ['scripts/seed.js', '--reset'], { SEED_PROJECT_ID: project });

const rulesUrl = `http://127.0.0.1:8080/emulator/v1/projects/${project}:securityRules`;
async function loadRules(file) {
  const content = readFileSync(join(root, file), 'utf8');
  const res = await fetch(rulesUrl, { method: 'PUT', body: JSON.stringify({ rules: { files: [{ name: file, content }] } }) });
  if (!res.ok) throw new Error(`No se pudieron cargar ${file} en el emulador: ${res.status}`);
  console.log(`reglas en el emulador (${project}): ${file}`);
}

// Cuentas de prueba en el emulador de Auth y su rol, con las reglas abiertas del emulador
{
  const { initializeApp } = req('firebase/app');
  const { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } = req('firebase/auth');
  const { getFirestore, connectFirestoreEmulator, doc, setDoc, terminate } = req('firebase/firestore');
  const app = initializeApp({ projectId: project, apiKey: 'demo-api-key' }, 'cuentas');
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  for (const a of JSON.parse(readFileSync(join(root, 'src/lib/demoAccounts.json'), 'utf8'))) {
    let uid;
    try {
      uid = (await signInWithEmailAndPassword(auth, a.email, PASSWORD)).user.uid;
    } catch {
      uid = (await createUserWithEmailAndPassword(auth, a.email, PASSWORD)).user.uid;
    }
    await setDoc(doc(db, 'users', uid), { role: a.role, driverId: a.driverId, name: a.name, email: a.email, active: true });
  }
  await signOut(auth);
  await terminate(db);
  console.log('cuentas de prueba listas en el emulador');
}

await loadRules('firestore.cloud.rules');
const server = spawn(process.execPath, [join(root, 'scripts/e2e/serve.mjs'), join(root, 'dist-emu'), '8090'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1000));
const e2e = spawnSync(process.execPath, [join(root, 'scripts/e2e/demoPhone.mjs'), 'http://localhost:8090'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, TRAZZA_CLAVE: PASSWORD },
});
server.kill();
await loadRules('firestore.rules');
process.exit(e2e.status ?? 1);
