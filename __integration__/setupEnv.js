// __integration__/setupEnv.js  (dueño: P1)
// Fuerza el emulador antes de que src/lib/firebase.js lea las variables.
process.env.EXPO_PUBLIC_USE_MOCKS = 'false';
process.env.EXPO_PUBLIC_USE_EMULATORS = 'true';
process.env.EXPO_PUBLIC_EMULATOR_HOST = '127.0.0.1';
// Un proyecto del emulador por archivo de prueba: los datos no se cruzan con la app ni con otras
// personas que prueben al mismo tiempo (el emulador separa los datos por proyecto)
process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID = `demo-pruebas-${process.pid}-${Date.now().toString(36)}`;
process.env.EXPO_PUBLIC_GEOAPIFY_LIVE = 'false'; // las pruebas nunca gastan créditos de Geoapify

// babel-preset-expo cambia process.env.EXPO_PUBLIC_* por este módulo (ESM)
jest.mock('expo/virtual/env', () => ({ env: process.env }));
// Módulos nativos de Expo que no existen en Node
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: {} } }));
jest.mock('../src/features/evidence/getCurrentGps', () => ({
  getCurrentGps: async () => ({ lat: 13.7035, lng: -89.24, accuracyM: 9 }),
}));
// La subida a Storage necesita expo-image-manipulator (nativo); aquí se sube un archivo de prueba
jest.mock('../src/features/evidence/uploadEvidence', () => {
  const { ref, uploadBytes } = jest.requireActual('firebase/storage');
  const { storage } = jest.requireActual('../src/lib/firebase');
  const path = (code, attempt, file) => `evidence/${code}/intento-${attempt}/${file}`;
  return {
    uploadEvidence: async ({ code, attempt, signatureBase64 }) => {
      const out = { photoUrl: path(code, attempt, 'foto.jpg') };
      await uploadBytes(ref(storage, out.photoUrl), new Uint8Array([0xff, 0xd8, 0xff]), { contentType: 'image/jpeg' });
      if (signatureBase64) {
        out.signatureUrl = path(code, attempt, 'firma.png');
        await uploadBytes(ref(storage, out.signatureUrl), new Uint8Array([0x89, 0x50]), { contentType: 'image/png' });
      }
      return out;
    },
  };
});
