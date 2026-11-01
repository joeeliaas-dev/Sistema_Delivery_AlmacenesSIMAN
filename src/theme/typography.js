// src/theme/typography.js (dueño: P3)
// Roboto (N18) cargada por P1 en app/_layout.js (C13). Cada estilo elige la fuente según su peso
// con fontFamily: Android ignora fontWeight cuando la fuente es propia.
// Para un peso distinto dentro de un estilo, usar fonts.* (no fontWeight).
// Rediseño (30 oct): pocos tamaños. Título de pantalla 22, sección 16 medium, texto 14–16.
// Los números van en cifras tabulares y los códigos (SIM-/WEB-) en la fuente normal.
import { Platform } from 'react-native';

export const fonts = {
  regular: 'Roboto_400Regular',
  medium: 'Roboto_500Medium',
  bold: 'Roboto_700Bold',
};

// Ya no se usa en pantalla; queda para quien lo importe
const mono = Platform.select({ ios: 'Menlo', default: 'monospace' });
const tabular = { fontVariant: ['tabular-nums'] };

export const typography = {
  fonts,
  mono,
  // Número que se lee de lejos ("3 de 12", "4.8 km")
  display: { fontSize: 24, lineHeight: 30, fontFamily: fonts.medium, ...tabular },
  // Era la etiqueta en mayúsculas espaciadas; ahora es un título de sección normal
  eyebrow: { fontSize: 16, lineHeight: 22, fontFamily: fonts.medium },
  // Título de pantalla
  headline: { fontSize: 22, lineHeight: 28, fontFamily: fonts.medium },
  // Título de sección
  title: { fontSize: 16, lineHeight: 22, fontFamily: fonts.medium },
  titleSmall: { fontSize: 16, lineHeight: 22, fontFamily: fonts.medium },
  body: { fontSize: 14, lineHeight: 20, fontFamily: fonts.regular },
  bodyLarge: { fontSize: 16, lineHeight: 22, fontFamily: fonts.regular },
  bodyStrong: { fontSize: 14, lineHeight: 20, fontFamily: fonts.medium },
  label: { fontSize: 14, lineHeight: 20, fontFamily: fonts.medium },
  caption: { fontSize: 12, lineHeight: 16, fontFamily: fonts.regular },
  captionStrong: { fontSize: 12, lineHeight: 16, fontFamily: fonts.medium },
  // Códigos SIM-/WEB-/SKU: fuente normal; el color gris lo pone cada pantalla
  code: { fontSize: 13, lineHeight: 18, fontFamily: fonts.regular, ...tabular },
  // Cifras en líneas de estado ("12 pendientes · 3 en ruta")
  number: { fontSize: 14, lineHeight: 20, fontFamily: fonts.medium, ...tabular },
};
