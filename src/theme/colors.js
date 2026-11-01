// src/theme/colors.js (dueño: P3)
// Tomados del Prototipo 1 (Figma). Nombres según Material 3, igual que el prototipo.
export const colors = {
  primary: '#6B5AA6',
  onPrimary: '#FFFFFF',
  primaryContainer: '#E9E0FF',
  onPrimaryContainer: '#24154F',

  secondaryContainer: '#ECE6F6',
  onSecondaryContainer: '#3A3350',

  tertiary: '#9A5B8A',
  tertiaryContainer: '#FBDDF0',
  onTertiaryContainer: '#3D1035',

  success: '#2F7D5B',
  successContainer: '#D3F2E3',
  // Texto verde sobre successContainer: el verde del prototipo da 4.2:1; este da 5.3:1
  onSuccessContainer: '#256B4C',

  // No aparecen en el prototipo; se usan para no_entregado y devuelto (error de Material 3).
  error: '#BA1A1A',
  errorContainer: '#FFDAD6',
  onErrorContainer: '#410002',

  surface: '#FCFAFF',
  surfaceDim: '#F3F0F8',
  surfaceLow: '#F7F4FB',
  surfaceContainer: '#F1EDF7',
  surfaceHigh: '#EBE6F2',
  onSurface: '#1D1B22',
  onSurfaceVariant: '#57536A',

  outline: '#8A859B',
  outlineVariant: '#D3CEDF',
  // Texto de ejemplo en campos: outline da 3.4:1; este da 5.0:1
  placeholder: '#6F6A82',

  white: '#FFFFFF',
  shadow: '#24154F',

  // Botón deshabilitado: on-surface al 10 % y texto al 40 %
  disabledContainer: 'rgba(29, 27, 34, 0.10)',
  disabledContent: 'rgba(29, 27, 34, 0.40)',
  // Sobre la tarjeta morada de Próxima parada
  // Chips de la tarjeta morada: al 15 % (prototipo) el texto blanco da 4.2:1; al 10 % da 4.6:1
  onPrimaryChip: 'rgba(255, 255, 255, 0.10)',
  onPrimaryBorder: 'rgba(255, 255, 255, 0.40)',

  // Naranja del prototipo 2 (C12): base del tono warning (pendiente, km) y de la barra superior
  kpiAccent: '#D07935',
  kpiAccentContainer: '#FFF1E5',
  kpiBorder: '#E0E7E3',

  // Dirección visual (V1): fondo gris claro y tarjetas blancas con borde
  background: '#F5F4F8',
  cardBorder: '#E7E3EF',
  // Extremo oscuro del degradado de Próxima parada (blanco encima da 7.2:1)
  primaryDark: '#5B4A9C',

  // Pares por estado (V5). El texto va en el color "on…" o en el que ya cumple 4.5:1
  info: '#2B6CB0', // texto sobre infoContainer: 4.6:1
  infoContainer: '#E3EEFA',
  warning: '#D07935', // = kpiAccent; solo íconos y barras (como texto da 2.9:1)
  warningContainer: '#FFF1E5', // = kpiAccentContainer
  onWarningContainer: '#9A4F16', // texto naranja: 5.4:1
  neutral: '#6B6878', // texto sobre neutralContainer: 4.7:1
  neutralContainer: '#EEEDF2',

  // Mapa del prototipo (para RouteMap de P2)
  mapLand: '#F4F1F9',
  mapGreen: '#E6F0EA',
  mapWater: '#E1ECF5',
};
