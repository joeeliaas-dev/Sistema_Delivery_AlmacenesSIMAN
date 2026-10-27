import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
export const readDraft = () => null;
export const writeDraft = () => {};
export const removeDraft = () => {};
export const photoForDraft = async (uri) => uri;
export async function pendingPhoto() {
  if (Platform.OS !== 'android') return null;
  try {
    const result = await ImagePicker.getPendingResultAsync();
    return result && !result.canceled && result.assets?.[0]?.uri ? result.assets[0].uri : null;
  } catch {
    return null;
  }
}
