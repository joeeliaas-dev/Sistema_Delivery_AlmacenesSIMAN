import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { ref, uploadBytes } from 'firebase/storage';
import { USE_MOCKS, storage } from '../../lib/firebase';
export const EVIDENCE_STORE = USE_MOCKS ? 'none' : (process.env.EXPO_PUBLIC_EVIDENCE_STORE ?? 'storage');
const STORAGE_PHOTO = {
  maxSide: 1280,
  quality: 0.6,
};
const INLINE_PHOTO = [
  {
    maxSide: 960,
    quality: 0.5,
  },
  {
    maxSide: 720,
    quality: 0.4,
  },
];
const INLINE_MAX_CHARS = 700000;
const SIGNATURE_WIDTH = 600;
export const evidencePath = (code, attempt, file) => `evidence/${code}/intento-${attempt}/${file}`;
export const evidenceDocId = (code, attempt) => `${code}_intento-${attempt}`;
async function compressPhoto(uri, { maxSide, quality }, base64 = false) {
  const original = await ImageManipulator.manipulate(uri).renderAsync();
  const { width, height } = original;
  const image =
    Math.max(width, height) > maxSide
      ? await ImageManipulator.manipulate(original)
          .resize(
            width >= height
              ? {
                  width: maxSide,
                }
              : {
                  height: maxSide,
                },
          )
          .renderAsync()
      : original;
  return image.saveAsync({
    compress: quality,
    format: SaveFormat.JPEG,
    base64,
  });
}
async function signatureImage(signatureBase64, base64 = false) {
  const dataUri = signatureBase64.startsWith('data:') ? signatureBase64 : `data:image/png;base64,${signatureBase64}`;
  let image = await ImageManipulator.manipulate(dataUri).renderAsync();
  if (base64 && image.width > SIGNATURE_WIDTH)
    image = await ImageManipulator.manipulate(image)
      .resize({
        width: SIGNATURE_WIDTH,
      })
      .renderAsync();
  return image.saveAsync({
    format: SaveFormat.PNG,
    base64,
  });
}
async function upload(path, fileUri, contentType) {
  const blob = await (await fetch(fileUri)).blob();
  await uploadBytes(ref(storage, path), blob, {
    contentType,
  });
}
async function inlineEvidence({ code, attempt, photoUri, signatureBase64 }) {
  const signature = signatureBase64
    ? `data:image/png;base64,${(await signatureImage(signatureBase64, true)).base64}`
    : null;
  for (const opts of INLINE_PHOTO) {
    const photo = `data:image/jpeg;base64,${(await compressPhoto(photoUri, opts, true)).base64}`;
    if (photo.length + (signature?.length ?? 0) <= INLINE_MAX_CHARS) {
      const id = evidenceDocId(code, attempt);
      return {
        photoUrl: `firestore://evidence/${id}/photo`,
        ...(signature
          ? {
              signatureUrl: `firestore://evidence/${id}/signature`,
            }
          : {}),
        inline: {
          id,
          data: {
            code,
            attempt,
            photo,
            signature,
          },
        },
      };
    }
  }
  throw new Error('La foto es demasiado pesada. Tómela de nuevo, un poco más lejos.');
}
export async function uploadEvidence({ code, attempt, photoUri, signatureBase64 }) {
  if (EVIDENCE_STORE === 'firestore')
    return inlineEvidence({
      code,
      attempt,
      photoUri,
      signatureBase64,
    });
  const result = {
    photoUrl: evidencePath(code, attempt, 'foto.jpg'),
  };
  if (signatureBase64) result.signatureUrl = evidencePath(code, attempt, 'firma.png');
  if (EVIDENCE_STORE !== 'storage') return result;
  const [photo, signature] = await Promise.all([
    compressPhoto(photoUri, STORAGE_PHOTO),
    signatureBase64 ? signatureImage(signatureBase64) : null,
  ]);
  await Promise.all([
    upload(result.photoUrl, photo.uri, 'image/jpeg'),
    signature ? upload(result.signatureUrl, signature.uri, 'image/png') : null,
  ]);
  return result;
}
