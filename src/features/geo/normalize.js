// src/features/geo/normalize.js  (dueño: P1)
// Normalización de textos y teléfonos del Excel.

/** Minúsculas, sin tildes ni signos, espacios simples ("Col. Escalón #3" → "col escalon #3"). */
export const normalizeText = (s = '') =>
  String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9#]+/g, ' ')
    .trim();

/** Teléfono de 8 dígitos (sin +503 ni guiones) o null. */
export function phone8(phone) {
  let d = String(phone ?? '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('503')) d = d.slice(3);
  return /^[267]\d{7}$/.test(d) ? d : null;
}
