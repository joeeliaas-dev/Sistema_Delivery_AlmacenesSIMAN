// src/lib/writer.js  (dueño: P1)
// Aplica una lista de escrituras de una sola vez (todo o nada): una transacción en
// Firestore, o la base en memoria en modo mocks. Solo lo usan los servicios de P1.
// Las condiciones se revisan DENTRO de la transacción, así dos teléfonos que escriben
// al mismo tiempo no se pisan: el segundo recibe un error claro y no se guarda nada.
import { collection, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { USE_MOCKS, db } from './firebase';
import { mockDb } from '../mocks';

// Marca para "hora del servidor": serverTimestamp() en Firestore, ISO en mocks
export const NOW = Symbol('now');

const fill = (data, now) => Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v === NOW ? now : v]));

/**
 * @param {Array<
 *   | { kind: 'create', col: string, id: string, data: object, existsError: string } // falla si ya existe
 *   | { kind: 'update', col: string, id: string, data: object,
 *       expect?: { field: string, value: any, error: string } }                  // falla si cambió
 *   | { kind: 'set', col: string, id: string, data: object }                       // crea o combina (merge)
 *   | { kind: 'addEvent', shipmentId: string, data: object }
 * >} ops
 */
export async function commitOps(ops) {
  // Revisa las condiciones contra el documento actual (null = no existe)
  const check = (op, current) => {
    if (op.kind === 'create' && current) throw new Error(op.existsError);
    if (op.kind === 'update' && !current) throw new Error(`No existe ${op.col}/${op.id}`);
    if (op.kind === 'update' && op.expect && current[op.expect.field] !== op.expect.value)
      throw new Error(op.expect.error);
  };
  const guarded = ops.filter((op) => op.kind === 'create' || op.kind === 'update');

  if (USE_MOCKS) {
    for (const op of guarded) check(op, mockDb.get(op.col, op.id));
    const now = new Date().toISOString();
    for (const op of ops) {
      if (op.kind === 'addEvent') mockDb.add('events', { shipmentId: op.shipmentId, ...fill(op.data, now) });
      else mockDb.upsert(op.col, { id: op.id, ...fill(op.data, now) });
    }
    return;
  }

  await runTransaction(db, async (tx) => {
    // En una transacción, primero todas las lecturas y después todas las escrituras
    const snaps = await Promise.all(guarded.map((op) => tx.get(doc(db, op.col, op.id))));
    guarded.forEach((op, i) => check(op, snaps[i].exists() ? snaps[i].data() : null));
    const now = serverTimestamp();
    for (const op of ops) {
      if (op.kind === 'create') tx.set(doc(db, op.col, op.id), fill(op.data, now));
      else if (op.kind === 'set') tx.set(doc(db, op.col, op.id), fill(op.data, now), { merge: true });
      else if (op.kind === 'update') tx.update(doc(db, op.col, op.id), fill(op.data, now));
      else tx.set(doc(collection(db, 'shipments', op.shipmentId, 'events')), fill(op.data, now));
    }
  });
}
