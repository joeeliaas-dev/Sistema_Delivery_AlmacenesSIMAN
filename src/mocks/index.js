// src/mocks/index.js  (dueño: P1)
// Base en memoria con la misma forma que Firestore (modo mocks y vista previa web).
// Los JSON traen la fecha fija 2026-10-12; al cargar se cambia por la de hoy
// (fechas y ids de ruta) para que los filtros por `date` funcionen cualquier día.
// En web se guarda en el navegador de cada dispositivo, así una recarga (por ejemplo,
// al volver de la cámara en un teléfono) no borra la prueba. reset() vuelve al inicio.
// Regenerar los JSON: npm run mocks (y subir STORAGE_KEY para descartar lo guardado)
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
  events: [], // shipments/{id}/events aplanado: cada evento lleva shipmentId
  evidence: [], // fotos y firmas comprimidas (solo con EXPO_PUBLIC_EVIDENCE_STORE=firestore)
});

// localStorage solo existe en web; en el teléfono y en Jest queda en null
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
    return saved?.date === todayISO() ? saved : null; // lo de otro día se descarta
  } catch {
    return null;
  }
}

function save() {
  try {
    browserStorage?.setItem(STORAGE_KEY, JSON.stringify({ date: todayISO(), nextId, collections }));
  } catch {
    // sin espacio o almacenamiento bloqueado: se sigue solo en memoria
  }
}

const saved = loadSaved();
let collections = saved?.collections ?? initialCollections();
let nextId = saved?.nextId ?? 1;
const listeners = new Set();

export const MOCKS_PERSISTED = Boolean(browserStorage);

export const mockDb = {
  all: (name) => collections[name].map((d) => ({ ...d })),
  get: (name, id) => {
    const found = collections[name].find((d) => d.id === id);
    return found ? { ...found } : null;
  },
  // Igual que onSnapshot: llama de inmediato y en cada cambio; devuelve la función para cancelar
  listen: (name, select, cb) => {
    const entry = { name, run: () => cb(select(mockDb.all(name))) };
    listeners.add(entry);
    Promise.resolve().then(() => listeners.has(entry) && entry.run());
    return () => listeners.delete(entry);
  },
  // Solo para los servicios de P1/P2 en modo mocks; las pantallas nunca escriben
  upsert: (name, doc) => {
    const list = collections[name];
    const i = list.findIndex((d) => d.id === doc.id);
    if (i === -1) list.push({ ...doc });
    else list[i] = { ...list[i], ...doc };
    save();
    listeners.forEach((l) => l.name === name && l.run());
  },
  // Como addDoc: genera el id
  add: (name, doc) => {
    const id = `mock-${nextId++}`;
    mockDb.upsert(name, { ...doc, id });
    return id;
  },
  // Vuelve a los datos iniciales (botón "Reiniciar datos" de la barra superior)
  reset: () => {
    collections = initialCollections();
    nextId = 1;
    save();
    listeners.forEach((l) => l.run());
  },
};
