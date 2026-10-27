import { todayISO } from '../lib/dates';
import depot from './depot.json';
import drivers from './drivers.json';
import routes from './routes.json';
import shipments from './shipments.json';
import zones from './zones.json';
const MOCK_DATE = '2026-10-12';
const STORAGE_KEY = 'siman-logistica:mocks:v1';
const toToday = (data) => JSON.parse(JSON.stringify(data).replaceAll(MOCK_DATE, todayISO()));
const initialCollections = () => ({
  depots: toToday([depot]),
  zones: toToday(zones),
  drivers: toToday(drivers),
  shipments: toToday(shipments),
  routes: toToday(routes),
  events: [],
  evidence: [],
});
const browserStorage = (() => {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
})();
function loadSaved() {
  try {
    const saved = JSON.parse(browserStorage?.getItem(STORAGE_KEY) ?? 'null');
    return saved?.date === todayISO() ? saved : null;
  } catch {
    return null;
  }
}
function save() {
  try {
    browserStorage?.setItem(
      STORAGE_KEY,
      JSON.stringify({
        date: todayISO(),
        nextId,
        collections,
      }),
    );
  } catch {}
}
const saved = loadSaved();
let collections = saved?.collections ?? initialCollections();
let nextId = saved?.nextId ?? 1;
const listeners = new Set();
export const MOCKS_PERSISTED = Boolean(browserStorage);
export const mockDb = {
  all: (name) =>
    collections[name].map((d) => ({
      ...d,
    })),
  get: (name, id) => {
    const found = collections[name].find((d) => d.id === id);
    return found
      ? {
          ...found,
        }
      : null;
  },
  listen: (name, select, cb) => {
    const entry = {
      name,
      run: () => cb(select(mockDb.all(name))),
    };
    listeners.add(entry);
    Promise.resolve().then(() => listeners.has(entry) && entry.run());
    return () => listeners.delete(entry);
  },
  upsert: (name, doc) => {
    const list = collections[name];
    const i = list.findIndex((d) => d.id === doc.id);
    if (i === -1)
      list.push({
        ...doc,
      });
    else
      list[i] = {
        ...list[i],
        ...doc,
      };
    save();
    listeners.forEach((l) => l.name === name && l.run());
  },
  add: (name, doc) => {
    const id = `mock-${nextId++}`;
    mockDb.upsert(name, {
      ...doc,
      id,
    });
    return id;
  },
  reset: () => {
    collections = initialCollections();
    nextId = 1;
    save();
    listeners.forEach((l) => l.run());
  },
};
