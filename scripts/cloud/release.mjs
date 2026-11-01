// scripts/cloud/release.mjs  (dueño: P1)
// Publicación completa en trazzasv, en orden y deteniéndose al primer problema:
//   1) pruebas (jest) y lint           2) compila la versión nube (dist-cloud)
//   3) revisa la compilación: lleva la clave de Geoapify y nada del emulador
//   4) sube hosting (trazzasv; trazza-web solo redirige)
//   5) recarga los datos del día y sube firestore.cloud.rules (seed:cloud)
//   6) revisa las reglas en producción (check:cloud)   7) chequeo de humo (smoke.mjs)
// Uso: npm run release:cloud              publica todo
//      npm run release:cloud -- --solo-revisar   ensayo: pasos 1 a 3, sin subir nada
//      npm run release:cloud -- --sin-datos      se salta el paso 5 (no recarga datos ni sube reglas)
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const keepData = process.argv.includes('--sin-datos');
const dryRun = process.argv.includes('--solo-revisar');
const step = (n, title) => console.log(`\n=== ${n}. ${title}`);
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) {
    console.error(`\n✗ Se detuvo en: ${cmd} ${args.join(' ')}. No se siguió con los pasos siguientes.`);
    process.exit(r.status ?? 1);
  }
};

step(1, 'Pruebas y lint');
run('npx', ['jest', '--silent']);
run('npm', ['run', 'lint']);

step(2, 'Compilar la versión nube');
run('node', ['scripts/cloud/buildCloud.mjs']);

step(3, 'Revisar la compilación');
const js = join(root, 'dist-cloud/_expo/static/js/web');
const bundle = readdirSync(js).map((f) => readFileSync(join(js, f), 'utf8')).join('\n');
const env = readFileSync(join(root, '.env.local'), 'utf8');
const key = /EXPO_PUBLIC_GEOAPIFY_KEY=(.+)/.exec(env)?.[1]?.trim();
const problems = [
  !key && 'falta EXPO_PUBLIC_GEOAPIFY_KEY en .env.local',
  key && !bundle.includes(key) && 'la compilación no lleva la clave de Geoapify',
  /127\.0\.0\.1:8080|demo-siman-logistica/.test(bundle) && 'la compilación apunta al emulador',
].filter(Boolean);
if (problems.length) {
  console.error(`✗ ${problems.join('; ')}`);
  process.exit(1);
}
console.log('✓ clave de Geoapify incluida y sin referencias al emulador');

// La app pide login (C48): sin "Correo electrónico/contraseña" activo en Firebase Authentication nadie podría
// entrar a trazzasv. Se prueba entrar con un correo que no existe (no crea nada) y se mira el motivo del rechazo.
const cloud = JSON.parse(readFileSync(join(root, 'scripts/cloud/cloudConfig.json'), 'utf8'));
const probe = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${cloud.apiKey}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Referer: 'https://trazzasv.web.app/' },
  body: JSON.stringify({ email: 'sondeo-no-existe@trazzasv.test', password: 'x12345678', returnSecureToken: true }),
}).then((r) => r.json()).catch(() => null);
const why = probe?.error?.message ?? '';
if (/CONFIGURATION_NOT_FOUND|OPERATION_NOT_ALLOWED|PASSWORD_LOGIN_DISABLED/.test(why)) {
  console.error(
    `✗ El inicio de sesión con correo no está activo en Firebase (${why}). Abra la consola de Firebase → Authentication → ` +
      'Comenzar → Sign-in method → Correo electrónico/contraseña → Habilitar, y vuelva a publicar. No se subió nada.',
  );
  process.exit(1);
}
console.log(`✓ inicio de sesión con correo activo en Firebase (${why || 'responde'})`);
if (dryRun) {
  console.log('\n✓ Ensayo listo (--solo-revisar): no se subió nada.');
  process.exit(0);
}

step(4, 'Subir hosting');
run('npx', ['firebase', 'deploy', '--config', 'firebase.cloud.json', '--only', 'hosting', '--project', 'proyecto-mad-9bdd2']);

if (keepData) console.log('\n(--sin-datos: no se recargan datos ni se suben reglas)');
else {
  step(5, 'Recargar datos del día y subir las reglas de la nube');
  run('node', ['scripts/cloud/seedCloud.mjs']);
}

step(6, 'Revisar reglas en producción');
run('node', ['scripts/cloud/checkRules.mjs']);

step(7, 'Chequeo de humo');
run('node', ['scripts/cloud/smoke.mjs']);

console.log('\n✓ Publicado y verificado en https://trazzasv.web.app');
