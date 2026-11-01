// scripts/cloud/buildCloud.mjs  (dueño: P1)
// Compila la versión web conectada a Firebase EN LA NUBE (sin mocks ni emuladores) en dist-cloud/.
// Uso: npm run build:cloud              (fotos y firmas comprimidas en Firestore: plan Spark, N35)
//      npm run build:cloud -- --storage   (fotos y firmas en Cloud Storage: requiere plan Blaze)
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const cfg = JSON.parse(readFileSync(join(root, 'scripts/cloud/cloudConfig.json'), 'utf8'));
const withStorage = process.argv.includes('--storage');

const env = {
  ...process.env,
  EXPO_PUBLIC_USE_MOCKS: 'false',
  EXPO_PUBLIC_USE_EMULATORS: 'false',
  EXPO_PUBLIC_EVIDENCE_STORE: withStorage ? 'storage' : 'firestore',
  // "Optimizar día" por zona en la nube hasta que la conjunta gane con Geoapify real (C50); --conjunta la activa
  EXPO_PUBLIC_DAY_OPTIMIZER: process.argv.includes('--conjunta') ? 'conjunta' : 'zona',
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: cfg.projectId,
  EXPO_PUBLIC_FIREBASE_API_KEY: cfg.apiKey,
  EXPO_PUBLIC_FIREBASE_APP_ID: cfg.appId,
  EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: cfg.storageBucket,
};
// --clear: la caché de Metro guarda los valores de EXPO_PUBLIC_* de la compilación anterior
const r = spawnSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', 'dist-cloud', '--clear'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env,
});
console.log(`\nVersión nube en dist-cloud/ · proyecto ${cfg.projectId} · evidencia en ${withStorage ? 'Cloud Storage' : 'Firestore (comprimida)'}`);
process.exit(r.status ?? 1);
