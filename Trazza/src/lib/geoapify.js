// src/lib/geoapify.js  (dueño: P1)
// Única puerta a la API de Geoapify (geocodificación y Route Planner). La clave sale de
// EXPO_PUBLIC_GEOAPIFY_KEY (.env.local) y nunca se escribe en el código.
import { API_TIMEOUT_MS, GEOAPIFY_DAILY_LIMIT } from '../constants';

const BASE = 'https://api.geoapify.com';
const KEY = process.env.EXPO_PUBLIC_GEOAPIFY_KEY ?? '';
// Con clave se usa la API real (y sus mapas en el despacho)
export const GEOAPIFY_LIVE = Boolean(KEY);

/** Error de Geoapify con code: 'timeout' | 'quota' | 'http' | 'offline'. */
export class GeoapifyError extends Error {
  constructor(code, message, status = null) {
    super(message);
    this.name = 'GeoapifyError';
    this.code = code;
    this.status = status;
  }
}

const MESSAGES = {
  timeout: 'Geoapify no respondió a tiempo.',
  quota: 'Se acabaron los créditos de Geoapify por hoy.',
  offline: 'Sin conexión a internet.',
};

// Uso del día en este equipo (N50): en web se guarda en el navegador; en el teléfono, en memoria
const USAGE_KEY = 'siman-logistica:geoapify-uso';
let memoryUsage = null;
const today = () => new Date().toLocaleDateString('en-CA');
function readUsage() {
  let u = memoryUsage;
  try {
    if (typeof localStorage !== 'undefined') u = JSON.parse(localStorage.getItem(USAGE_KEY) || 'null');
  } catch {
    // sin almacenamiento: se cuenta en memoria
  }
  return u?.date === today() ? u : { date: today(), geocode: 0, routeplanner: 0 };
}
function writeUsage(u) {
  memoryUsage = u;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(USAGE_KEY, JSON.stringify(u));
  } catch {
    // sin almacenamiento: queda en memoria
  }
}

/** Llamadas reales a Geoapify hechas hoy en este equipo: { date, geocode, routeplanner }. */
export const geoapifyUsage = () => readUsage();

/** Cuenta una llamada; si ya se llegó al tope del día lanza GeoapifyError('quota') sin llamar a la API. */
function spend(path) {
  const kind = path.includes('routeplanner') ? 'routeplanner' : 'geocode';
  const u = readUsage();
  const limit = GEOAPIFY_DAILY_LIMIT[kind];
  if (u[kind] >= limit)
    throw new GeoapifyError(
      'quota',
      `Se llegó al límite diario de Geoapify en este equipo (${limit} ${kind === 'geocode' ? 'búsquedas de direcciones' : 'optimizaciones'}). Mañana se reinicia.`,
    );
  writeUsage({ ...u, [kind]: u[kind] + 1 });
}

/**
 * @param {string} path  p. ej. '/v1/geocode/search' o '/v1/routeplanner'
 * @param {{ method?: 'GET'|'POST', body?: object, params?: object, timeoutMs?: number }} [opts]
 * @returns {Promise<object>} JSON de la respuesta
 * @throws {GeoapifyError}
 */
export async function geoapifyFetch(path, { method = 'GET', body, params = {}, timeoutMs = API_TIMEOUT_MS } = {}) {
  if (!KEY) throw new GeoapifyError('http', 'Falta la clave de Geoapify (EXPO_PUBLIC_GEOAPIFY_KEY).');
  spend(path);

  const qs = new URLSearchParams({ ...params, apiKey: KEY }).toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${BASE}${path}?${qs}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw new GeoapifyError('timeout', MESSAGES.timeout);
    throw new GeoapifyError('offline', MESSAGES.offline);
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 429 || res.status === 402) throw new GeoapifyError('quota', MESSAGES.quota, res.status);
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new GeoapifyError('http', `Geoapify respondió ${res.status}. ${detail.slice(0, 200)}`.trim(), res.status);
  }
  return res.json();
}
