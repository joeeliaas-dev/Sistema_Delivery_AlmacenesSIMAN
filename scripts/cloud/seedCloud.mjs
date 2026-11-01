// scripts/cloud/seedCloud.mjs  (dueño: P1)
// Carga los datos iniciales en Firebase EN LA NUBE (proyecto-mad-9bdd2), con la fecha de hoy.
// Las reglas de la nube no permiten crear datos, así que:
//   1) sube reglas temporales de carga (firestore.seed.rules)
//   2) borra lo que haya (depósito, zonas, motoristas, rutas, envíos, su historial y la evidencia) y carga todo
//   3) SIEMPRE vuelve a subir las reglas limitadas (firestore.cloud.rules), aunque algo falle
// Uso: npm run seed:cloud            (fecha de hoy)
//      npm run seed:cloud -- --date 2026-10-12
// Requiere sesión de Firebase CLI con acceso al proyecto.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase/app';
import { collection, doc, getDocs, getFirestore, terminate, writeBatch } from 'firebase/firestore';
import { getStorage, ref, uploadBytes } from 'firebase/storage';
import { buildDataset, eventsFor } from '../data/buildDataset.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const cfg = JSON.parse(readFileSync(join(root, 'scripts/cloud/cloudConfig.json'), 'utf8'));
const pad = (n) => String(n).padStart(2, '0');
const today = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const argDate = process.argv.indexOf('--date');
const date = argDate > -1 ? process.argv[argDate + 1] : today();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function deployRules(configFile) {
  const r = spawnSync(
    'firebase',
    ['deploy', '--config', configFile, '--only', 'firestore:rules', '--project', cfg.projectId, '--non-interactive'],
    {
      cwd: root,
      shell: process.platform === 'win32',
      encoding: 'utf8',
    },
  );
  if (r.status !== 0) throw new Error(`No se pudieron subir las reglas (${configFile}):\n${r.stdout}${r.stderr}`);
}

// Las reglas nuevas tardan unos segundos en aplicarse: reintenta mientras diga "permission-denied"
async function retry(fn, what) {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (err.code !== 'permission-denied' || i >= 36) throw new Error(`${what}: ${err.message}`);
      await sleep(5000);
    }
  }
}

async function commitInChunks(db, ops) {
  for (let i = 0; i < ops.length; i += 450) {
    const batch = writeBatch(db);
    ops.slice(i, i + 450).forEach((op) => op(batch));
    await retry(() => batch.commit(), 'escribir');
  }
}

const app = initializeApp(cfg);
const db = getFirestore(app);
let failed = false;

try {
  console.log(`1/3 reglas de carga temporales…`);
  deployRules('firebase.cloud-seed.json');
  console.log('   esperando 30 s a que se apliquen…');
  await sleep(30000);

  console.log(`2/3 borrando y cargando datos del ${date}…`);
  const deletes = [];
  // vehicles y addresses ya no se usan: se borran si quedaron de una carga anterior
  for (const name of ['depots', 'zones', 'drivers', 'vehicles', 'addresses', 'routes', 'shipments', 'evidence']) {
    const snap = await retry(() => getDocs(collection(db, name)), `leer ${name}`);
    for (const d of snap.docs) {
      if (name === 'shipments') {
        const evs = await retry(() => getDocs(collection(db, 'shipments', d.id, 'events')), 'leer eventos');
        evs.docs.forEach((e) => deletes.push((b) => b.delete(e.ref)));
      }
      deletes.push((b) => b.delete(d.ref));
    }
  }
  await commitInChunks(db, deletes);

  const data = buildDataset({ date });
  const writes = [];
  const put = (col, { id, ...rest }) => writes.push((b) => b.set(doc(db, col, id), rest));
  put('depots', data.depot);
  data.zones.forEach((z) => put('zones', z));
  data.drivers.forEach((d) => put('drivers', d));
  data.routes.forEach((r) => put('routes', r));
  const driverOfZone = Object.fromEntries(data.zones.map((z) => [z.id, z.driverId]));
  let events = 0;
  for (const s of data.shipments) {
    put('shipments', s);
    for (const { id, ...ev } of eventsFor(s, driverOfZone[s.zoneId])) {
      writes.push((b) => b.set(doc(db, 'shipments', s.id, 'events', id), ev));
      events += 1;
    }
  }
  await commitInChunks(db, writes);
  console.log(
    `   ${deletes.length} documentos borrados; cargados 1 depósito, ${data.zones.length} zonas, ${data.drivers.length} motoristas, ${data.routes.length} ruta, ${data.shipments.length} envíos y ${events} eventos`,
  );

  // Foto y firma de muestra de los entregados (solo si Storage está activo: requiere plan Blaze)
  try {
    const storage = getStorage(app);
    const sample = new Uint8Array(readFileSync(join(root, 'assets', 'icon.png')));
    const files = data.shipments.flatMap((s) => {
      const e = s.lastEvidence ?? s.lastFailure;
      return e ? [e.photoUrl, e.signatureUrl].filter(Boolean) : [];
    });
    for (const path of files) {
      await uploadBytes(ref(storage, path), sample, {
        contentType: path.endsWith('.png') ? 'image/png' : 'image/jpeg',
      });
    }
    console.log(`   ${files.length} archivos de evidencia de muestra en Storage`);
  } catch (err) {
    console.log(
      `   Storage no disponible (¿plan Blaze sin activar?): se omiten las fotos de muestra. ${err.code ?? ''}`,
    );
  }
} catch (err) {
  failed = true;
  console.error(err.message);
} finally {
  console.log('3/3 restaurando las reglas limitadas…');
  try {
    deployRules('firebase.cloud.json');
    console.log('   reglas limitadas subidas; esperando 90 s a que se apliquen en todos los servidores…');
    await sleep(90000);
    console.log('   listo: firestore.cloud.rules activas');
  } catch (err) {
    failed = true;
    console.error(
      `¡ATENCIÓN! No se pudieron restaurar las reglas limitadas. Corre: firebase deploy --config firebase.cloud.json --only firestore:rules --project ${cfg.projectId}\n${err.message}`,
    );
  }
  await terminate(db);
}
process.exit(failed ? 1 : 0);
