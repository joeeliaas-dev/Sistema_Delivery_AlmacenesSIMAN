// src/features/driver/draftStorage.js (dueño: P3) — Android e iOS
// En la app nativa la pantalla no se recarga al volver de la cámara, así que no hace falta
// guardar el borrador. Lo que sí pasa en Android: el sistema puede cerrar la app mientras la
// cámara está abierta; la foto se recupera con getPendingResultAsync (N26).
// La versión web (sessionStorage) está en draftStorage.web.js.
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

export const readDraft = () => null;
export const writeDraft = () => {};
export const removeDraft = () => {};
export const photoForDraft = async (uri) => uri;

/** URI de la foto que quedó pendiente si Android cerró la app con la cámara abierta, o null. */
export async function pendingPhoto() {
  if (Platform.OS !== 'android') return null;
  try {
    const result = await ImagePicker.getPendingResultAsync();
    return result && !result.canceled && result.assets?.[0]?.uri ? result.assets[0].uri : null;
  } catch {
    return null;
  }
}
