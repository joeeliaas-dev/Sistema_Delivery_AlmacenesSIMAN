process.env.EXPO_PUBLIC_USE_MOCKS = 'false';
process.env.EXPO_PUBLIC_USE_EMULATORS = 'true';
process.env.EXPO_PUBLIC_EMULATOR_HOST = '127.0.0.1';
process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID = 'demo-siman-logistica';
jest.mock('expo/virtual/env', () => ({
  env: process.env,
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {},
  },
}));
jest.mock('../src/features/evidence/getCurrentGps', () => ({
  getCurrentGps: async () => ({
    lat: 13.7035,
    lng: -89.24,
    accuracyM: 9,
  }),
}));
jest.mock('../src/features/evidence/uploadEvidence', () => {
  const { ref, uploadBytes } = jest.requireActual('firebase/storage');
  const { storage } = jest.requireActual('../src/lib/firebase');
  const path = (code, attempt, file) => `evidence/${code}/intento-${attempt}/${file}`;
  return {
    uploadEvidence: async ({ code, attempt, signatureBase64 }) => {
      const out = {
        photoUrl: path(code, attempt, 'foto.jpg'),
      };
      await uploadBytes(ref(storage, out.photoUrl), new Uint8Array([0xff, 0xd8, 0xff]), {
        contentType: 'image/jpeg',
      });
      if (signatureBase64) {
        out.signatureUrl = path(code, attempt, 'firma.png');
        await uploadBytes(ref(storage, out.signatureUrl), new Uint8Array([0x89, 0x50]), {
          contentType: 'image/png',
        });
      }
      return out;
    },
  };
});
