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
  } catch {}
}
export function removeDraft(key) {
  try {
    window.sessionStorage.removeItem(PREFIX + key);
  } catch {}
}
const MAX_SIDE = 1280;
const QUALITY = 0.7;
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
export async function pendingPhoto() {
  return null;
}
