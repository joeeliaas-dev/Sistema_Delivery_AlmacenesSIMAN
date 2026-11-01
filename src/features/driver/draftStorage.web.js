// src/features/driver/draftStorage.web.js (dueño: P3) — solo web
// Borrador del formulario de evidencia en sessionStorage (N26): si Safari o Chrome recargan la
// página al volver de la cámara, la descripción, la firma y la foto siguen ahí.
// sessionStorage puede no existir o estar lleno: todo va en try/catch y falla en silencio.
const PREFIX = 'trazza:borrador:';

export function readDraft(key) {
  try {
    const raw = window.sessionStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeDraft(key, draft) {
  try {
    window.sessionStorage.setItem(PREFIX + key, JSON.stringify(draft));
  } catch {
    // Sin espacio o sin sessionStorage: el formulario sigue funcionando sin borrador
  }
}

export function removeDraft(key) {
  try {
    window.sessionStorage.removeItem(PREFIX + key);
  } catch {
    // nada que borrar
  }
}

const MAX_SIDE = 1280;
const QUALITY = 0.7;

/**
 * La cámara del navegador devuelve una URL blob: que no sobrevive a la recarga. Se pasa a
 * data URL JPEG de 1280 px como máximo (la misma escala que usa uploadEvidence), que cabe en
 * sessionStorage y sirve igual para guardar la entrega.
 */
export async function photoForDraft(uri) {
  if (!uri || uri.startsWith('data:')) return uri;
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new window.Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = uri;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', QUALITY);
  } catch {
    return uri;
  }
}

// En web no hay resultado pendiente de la cámara (eso es de Android)
export async function pendingPhoto() {
  return null;
}
