// src/features/geo/normalize.js  (dueño: P1)
// Normalización de textos y la llave de la libreta de direcciones.

/** Minúsculas, sin tildes ni signos, espacios simples ("Col. Escalón #3" → "col escalon #3"). */
export const normalizeText = (s = '') =>
  String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9#]+/g, ' ')
    .trim();

/** Hash djb2 en base 36, estable entre dispositivos. */
export function djb2(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** Dirección normalizada para la libreta: texto + municipio. */
export const addressNorm = ({ text, municipio }) => normalizeText(`${text ?? ''} ${municipio ?? ''}`);

/** Teléfono de 8 dígitos (sin +503 ni guiones) o null. */
export function phone8(phone) {
  let d = String(phone ?? '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('503')) d = d.slice(3);
  return /^[267]\d{7}$/.test(d) ? d : null;
}

/** Id del documento addresses/{phone}_{hash}. */
export const addressKey = (phone, address) => `${phone8(phone) ?? 'sin-telefono'}_${djb2(addressNorm(address))}`;
