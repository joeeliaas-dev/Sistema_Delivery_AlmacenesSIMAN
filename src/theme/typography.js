// src/theme/typography.js (dueño: P3)
// Roboto (N18) cargada por P1 en app/_layout.js (C13). Cada estilo elige la fuente según su peso
// con fontFamily: Android ignora fontWeight cuando la fuente es propia.
// Para un peso distinto dentro de un estilo, usar fonts.* (no fontWeight).
import { Platform } from 'react-native';

export const fonts = {
  regular: 'Roboto_400Regular',
  medium: 'Roboto_500Medium',
  bold: 'Roboto_700Bold',
};

const mono = Platform.select({ ios: 'Menlo', default: 'monospace' });

export const typography = {
  fonts,
  mono,
  // Métricas grandes (V3): "148", "3 de 8"
  display: { fontSize: 32, lineHeight: 38, fontFamily: fonts.bold, letterSpacing: -0.5 },
  // Etiqueta de sección (V4): "TU RUTA DE HOY"
  eyebrow: { fontSize: 12, lineHeight: 16, fontFamily: fonts.bold, letterSpacing: 1.5, textTransform: 'uppercase' },
  headline: { fontSize: 24, lineHeight: 30, fontFamily: fonts.regular },
  title: { fontSize: 18, lineHeight: 24, fontFamily: fonts.regular },
  titleSmall: { fontSize: 16, lineHeight: 24, fontFamily: fonts.medium },
  body: { fontSize: 14, lineHeight: 20, fontFamily: fonts.regular },
  bodyStrong: { fontSize: 14, lineHeight: 20, fontFamily: fonts.medium },
  label: { fontSize: 14, lineHeight: 20, fontFamily: fonts.medium },
  caption: { fontSize: 12, lineHeight: 16, fontFamily: fonts.regular },
  captionStrong: { fontSize: 12, lineHeight: 16, fontFamily: fonts.medium },
  code: { fontSize: 12, lineHeight: 16, fontFamily: mono },
};
