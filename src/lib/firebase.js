// src/lib/firebase.js  (dueño: P1)
// Expone app, db y storage (la sesión vive en src/lib/auth.js), con la configuración de .env.
// Solo con EXPO_PUBLIC_USE_EMULATORS=true se conecta al Emulator Suite (las pruebas de ../siman-pruebas).
import Constants from 'expo-constants';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { connectFirestoreEmulator, getFirestore, initializeFirestore } from 'firebase/firestore';
import { connectStorageEmulator, getStorage } from 'firebase/storage';

export const USE_EMULATORS = process.env.EXPO_PUBLIC_USE_EMULATORS === 'true';

const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
const config = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: `${projectId}.firebaseapp.com`,
  projectId,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? `${projectId}.appspot.com`,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

// IP de la PC: la misma que usa Metro (ej. "192.168.1.20:8081"), o la que se fije en .env
export const EMULATOR_HOST =
  process.env.EXPO_PUBLIC_EMULATOR_HOST ?? Constants.expoConfig?.hostUri?.split(':')[0] ?? 'localhost';

const firstInit = getApps().length === 0;
export const app = firstInit ? initializeApp(config) : getApp();

// React Native no tiene WebChannel estable; long polling evita cuelgues de onSnapshot.
export const db = firstInit ? initializeFirestore(app, { experimentalForceLongPolling: true }) : getFirestore(app);
export const storage = getStorage(app);

if (firstInit && USE_EMULATORS) {
  connectFirestoreEmulator(db, EMULATOR_HOST, 8080);
  connectStorageEmulator(storage, EMULATOR_HOST, 9199);
}

/** Una instancia aparte de Firebase (p. ej. 'altas': crear la cuenta de un motorista sin cerrar la sesión actual). */
export const secondaryApp = (name) => getApps().find((a) => a.name === name) ?? initializeApp(config, name);
