import { collection, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { USE_MOCKS, db } from './firebase';
import { mockDb } from '../mocks';
export const NOW = Symbol('now');
const fill = (data, now) => Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v === NOW ? now : v]));
export async function commitOps(ops) {
  const check = (op, current) => {
    if (op.kind === 'create' && current) throw new Error(op.existsError);
    if (op.kind === 'update' && !current) throw new Error(`No existe ${op.col}/${op.id}`);
    if (op.kind === 'update' && op.expect && current[op.expect.field] !== op.expect.value)
      throw new Error(op.expect.error);
  };
  const guarded = ops.filter((op) => op.kind !== 'addEvent');
  if (USE_MOCKS) {
    for (const op of guarded) check(op, mockDb.get(op.col, op.id));
    const now = new Date().toISOString();
    for (const op of ops) {
      if (op.kind === 'addEvent')
        mockDb.add('events', {
          shipmentId: op.shipmentId,
          ...fill(op.data, now),
        });
      else
        mockDb.upsert(op.col, {
          id: op.id,
          ...fill(op.data, now),
        });
    }
    return;
  }
  await runTransaction(db, async (tx) => {
    const snaps = await Promise.all(guarded.map((op) => tx.get(doc(db, op.col, op.id))));
    guarded.forEach((op, i) => check(op, snaps[i].exists() ? snaps[i].data() : null));
    const now = serverTimestamp();
    for (const op of ops) {
      if (op.kind === 'create') tx.set(doc(db, op.col, op.id), fill(op.data, now));
      else if (op.kind === 'update') tx.update(doc(db, op.col, op.id), fill(op.data, now));
      else tx.set(doc(collection(db, 'shipments', op.shipmentId, 'events')), fill(op.data, now));
    }
  });
}
