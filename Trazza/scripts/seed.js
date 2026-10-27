const { initializeApp } = require('firebase/app');
const { connectFirestoreEmulator, doc, getFirestore, terminate, writeBatch } = require('firebase/firestore');
const { connectStorageEmulator, getStorage, ref, uploadBytes } = require('firebase/storage');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const PROJECT_ID = 'demo-siman-logistica';
const HOST = process.env.EMULATOR_HOST ?? '127.0.0.1';
const FIRESTORE = `http://${HOST}:8080`;
const STORAGE = `http://${HOST}:9199`;
const BUCKET = `${PROJECT_ID}.appspot.com`;
const pad = (n) => String(n).padStart(2, '0');
const todayISO = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
async function ensureEmulator() {
  try {
    await fetch(FIRESTORE);
  } catch {
    throw new Error(`No hay emulador de Firestore en ${FIRESTORE}. Corre primero: npm run emulators`);
  }
}
async function reset() {
  const r = await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, {
    method: 'DELETE',
  });
  if (!r.ok) throw new Error(`No se pudo borrar Firestore (${r.status})`);
  const list = await fetch(`${STORAGE}/v0/b/${BUCKET}/o?prefix=evidence/`).then((x) =>
    x.ok
      ? x.json()
      : {
          items: [],
        },
  );
  for (const it of list.items ?? []) {
    await fetch(`${STORAGE}/v0/b/${BUCKET}/o/${encodeURIComponent(it.name)}`, {
      method: 'DELETE',
    });
  }
  console.log(`reset: Firestore vacío, ${list.items?.length ?? 0} archivos borrados de Storage`);
}
async function main() {
  await ensureEmulator();
  if (process.argv.includes('--reset')) await reset();
  const { buildDataset, eventsFor } = await import('./data/buildDataset.mjs');
  const date = todayISO();
  const data = buildDataset({
    date,
  });
  const app = initializeApp({
    projectId: PROJECT_ID,
    apiKey: 'demo-api-key',
    storageBucket: BUCKET,
  });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, HOST, 8080);
  const storage = getStorage(app);
  connectStorageEmulator(storage, HOST, 9199);
  const batch = writeBatch(db);
  const put = (col, { id, ...rest }) => batch.set(doc(db, col, id), rest);
  put('depots', data.depot);
  data.zones.forEach((z) => put('zones', z));
  data.drivers.forEach((d) => put('drivers', d));
  data.routes.forEach((r) => put('routes', r));
  const driverOfZone = Object.fromEntries(data.zones.map((z) => [z.id, z.driverId]));
  let events = 0;
  for (const s of data.shipments) {
    put('shipments', s);
    for (const { id, ...ev } of eventsFor(s, driverOfZone[s.zoneId])) {
      batch.set(doc(db, 'shipments', s.id, 'events', id), ev);
      events += 1;
    }
  }
  await batch.commit();
  const sample = new Uint8Array(readFileSync(join(__dirname, '..', 'assets', 'icon.png')));
  const files = data.shipments.flatMap((s) => {
    const e = s.lastEvidence ?? s.lastFailure;
    return e ? [e.photoUrl, e.signatureUrl].filter(Boolean) : [];
  });
  for (const path of files) {
    await uploadBytes(ref(storage, path), sample, {
      contentType: path.endsWith('.png') ? 'image/png' : 'image/jpeg',
    });
  }
  const count = data.shipments.reduce(
    (acc, s) => ({
      ...acc,
      [s.status]: (acc[s.status] ?? 0) + 1,
    }),
    {},
  );
  console.log(
    `seed ${date}: 1 depósito, ${data.zones.length} zonas, ${data.drivers.length} motoristas, ${data.routes.length} ruta, ${data.shipments.length} envíos, ${events} eventos, ${files.length} archivos`,
  );
  console.log(count);
  await terminate(db);
  process.exit(0);
}
main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
