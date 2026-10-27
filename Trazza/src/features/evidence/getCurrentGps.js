import * as Location from 'expo-location';
const TIMEOUT_MS = 10000;
const toGps = (pos) =>
  pos
    ? {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracyM: Math.round(pos.coords.accuracy ?? 0),
      }
    : null;
export async function getCurrentGps() {
  let timer;
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve(null), TIMEOUT_MS);
    });
    const pos = await Promise.race([
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }).catch(() => null),
      timeout,
    ]);
    return toGps(pos ?? (await Location.getLastKnownPositionAsync()));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
