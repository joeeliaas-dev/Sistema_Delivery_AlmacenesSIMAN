// __tests__/uploadEvidence.test.js  (dueño: P1)
// Evidencia en Firestore (N35): foto y firma comprimidas en un documento por intento.

// ImageManipulator simulado: cada saveAsync devuelve el base64 de la longitud configurada
let mockPhotoLengths;
let mockSaved;
jest.mock('expo-image-manipulator', () => {
  const image = (width, height) => ({
    width,
    height,
    saveAsync: async (opts) => {
      mockSaved.push(opts);
      const isPng = opts.format === 'png';
      const length = isPng ? 4000 : mockPhotoLengths.shift();
      return { uri: 'file:///img', base64: opts.base64 ? 'A'.repeat(length) : undefined };
    },
  });
  const ctx = (w, h) => ({ resize: () => ctx(640, 480), renderAsync: async () => image(w, h) });
  return {
    SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
    ImageManipulator: { manipulate: (src) => (typeof src === 'string' && src.startsWith('data:') ? ctx(900, 300) : ctx(4000, 3000)) },
  };
});

let uploadEvidence;
beforeEach(() => {
  jest.resetModules();
  mockPhotoLengths = [100000];
  mockSaved = [];
  process.env.EXPO_PUBLIC_EVIDENCE_STORE = 'firestore';
  jest.doMock('../src/lib/firebase', () => ({ USE_MOCKS: false, db: {}, storage: {} }));
  ({ uploadEvidence } = require('../src/features/evidence/uploadEvidence'));
});
afterAll(() => {
  delete process.env.EXPO_PUBLIC_EVIDENCE_STORE;
});

test('entrega: foto JPEG y firma PNG en un documento por intento, con referencias firestore://', async () => {
  const r = await uploadEvidence({ code: 'SIM-0419', attempt: 1, photoUri: 'file:///foto', signatureBase64: 'data:image/png;base64,AAA' });
  expect(r.inline.id).toBe('SIM-0419_intento-1');
  expect(r.inline.data).toMatchObject({ code: 'SIM-0419', attempt: 1 });
  expect(r.inline.data.photo.startsWith('data:image/jpeg;base64,')).toBe(true);
  expect(r.inline.data.signature.startsWith('data:image/png;base64,')).toBe(true);
  expect(r.photoUrl).toBe('firestore://evidence/SIM-0419_intento-1/photo');
  expect(r.signatureUrl).toBe('firestore://evidence/SIM-0419_intento-1/signature');
  expect(mockSaved.find((o) => o.format === 'jpeg')).toMatchObject({ compress: 0.5, base64: true });
});

test('no entregado: solo foto, sin firma', async () => {
  const r = await uploadEvidence({ code: 'SIM-0420', attempt: 2, photoUri: 'file:///foto' });
  expect(r.inline.id).toBe('SIM-0420_intento-2');
  expect(r.inline.data.signature).toBeNull();
  expect(r.signatureUrl).toBeUndefined();
});

test('si la foto pesa demasiado, se comprime más en un segundo intento', async () => {
  mockPhotoLengths = [900000, 300000];
  const r = await uploadEvidence({ code: 'SIM-0419', attempt: 1, photoUri: 'file:///foto' });
  expect(r.inline.data.photo.length).toBeLessThan(700000);
  expect(mockSaved.filter((o) => o.format === 'jpeg').map((o) => o.compress)).toEqual([0.5, 0.4]);
});

test('si aún pesa demasiado, avisa con un mensaje claro', async () => {
  mockPhotoLengths = [900000, 900000];
  await expect(uploadEvidence({ code: 'SIM-0419', attempt: 1, photoUri: 'file:///foto' })).rejects.toThrow(
    'La foto es demasiado pesada',
  );
});
