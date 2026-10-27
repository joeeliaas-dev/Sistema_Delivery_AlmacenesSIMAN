import Constants from 'expo-constants';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { connectFirestoreEmulator, getFirestore, initializeFirestore } from 'firebase/firestore';
import { connectStorageEmulator, getStorage } from 'firebase/storage';
export const USE_MOCKS = process.env.EXPO_PUBLIC_USE_MOCKS !== 'false';
const USE_EMULATORS = process.env.EXPO_PUBLIC_USE_EMULATORS !== 'false';
const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? 'demo-siman-logistica';
const config = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? 'demo-api-key',
  authDomain: `${projectId}.firebaseapp.com`,
  projectId,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? `${projectId}.appspot.com`,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? 'demo-app-id',
};
export const EMULATOR_HOST =
  process.env.EXPO_PUBLIC_EMULATOR_HOST ?? Constants.expoConfig?.hostUri?.split(':')[0] ?? 'localhost';
const firstInit = getApps().length === 0;
const app = firstInit ? initializeApp(config) : getApp();
export const db = firstInit
  ? initializeFirestore(app, {
      experimentalForceLongPolling: true,
    })
  : getFirestore(app);
export const storage = getStorage(app);
if (firstInit && USE_EMULATORS) {
  connectFirestoreEmulator(db, EMULATOR_HOST, 8080);
  connectStorageEmulator(storage, EMULATOR_HOST, 9199);
}
