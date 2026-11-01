// src/lib/firebase.js  (dueño: P1)
// Expone db y storage. En desarrollo se conectan al Emulator Suite de la PC
// que corre `npx expo start`; el teléfono la encuentra por la IP de Metro.
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

// IP de la PC: la misma que usa Metro (ej. "192.168.1.20:8081"), o la que se fije en .env
export const EMULATOR_HOST =
  process.env.EXPO_PUBLIC_EMULATOR_HOST ?? Constants.expoConfig?.hostUri?.split(':')[0] ?? 'localhost';

const firstInit = getApps().length === 0;
const app = firstInit ? initializeApp(config) : getApp();

// React Native no tiene WebChannel estable; long polling evita cuelgues de onSnapshot.
export const db = firstInit ? initializeFirestore(app, { experimentalForceLongPolling: true }) : getFirestore(app);
export const storage = getStorage(app);

if (firstInit && USE_EMULATORS) {
  connectFirestoreEmulator(db, EMULATOR_HOST, 8080);
  connectStorageEmulator(storage, EMULATOR_HOST, 9199);
}
