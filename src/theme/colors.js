// src/theme/colors.js (dueño: P3)
// Rediseño (30 oct): neutro de bodega. El color solo dice estado (verde, ámbar, rojo) o la ruta;
// el morado es el acento de la acción principal y de lo seleccionado, nunca un fondo de pantalla.
// Los nombres siguen los de Material 3 para no romper pantallas; los valores ya no son los de M3.
export const colors = {
  primary: '#6B5AA6',
  onPrimary: '#FFFFFF',
  // Fondo de lo seleccionado (fila, pestaña, chip): un toque de morado, no lila pastel
  primaryContainer: '#F1EFF8',
  onPrimaryContainer: '#3B2F6E',

  secondaryContainer: '#F1F1F3',
  onSecondaryContainer: '#3A3A42',

  // Express
  tertiary: '#9A3B72',
  tertiaryContainer: '#F7ECF2',
  onTertiaryContainer: '#7A2A58',

  success: '#1E7A4C',
  successContainer: '#E8F3ED',
  onSuccessContainer: '#17663E',

  error: '#B42318',
  errorContainer: '#FBEBE9',
  onErrorContainer: '#9A1D14',

  // Superficies neutras (sin tinte lila)
  surface: '#FFFFFF',
  surfaceDim: '#EFEFF1',
  surfaceLow: '#FAFAFB',
  surfaceContainer: '#F4F4F6',
  surfaceHigh: '#E9E9EC',
  // Texto: principal casi negro, secundario gris medio
  onSurface: '#1A1A1F',
  onSurfaceVariant: '#5E5E68',

  outline: '#8D8D96',
  outlineVariant: '#DCDCE1',
  placeholder: '#6E6E78',

  white: '#FFFFFF',
  shadow: '#000000',

  disabledContainer: 'rgba(26, 26, 31, 0.08)',
  disabledContent: 'rgba(26, 26, 31, 0.38)',
  // Restos de la tarjeta morada; quedan por compatibilidad
  onPrimaryChip: 'rgba(255, 255, 255, 0.10)',
  onPrimaryBorder: 'rgba(255, 255, 255, 0.40)',

  // Ámbar = revisar (pendiente, km)
  kpiAccent: '#B86E00',
  kpiAccentContainer: '#FBF2E2',
  kpiBorder: '#E3E3E7',

  // Fondo de pantalla gris muy claro; tarjetas blancas con borde de 1 px
  background: '#F6F6F7',
  cardBorder: '#E3E3E7',
  primaryDark: '#5B4A9C',

  // Pares por estado. El texto va en el color "on…" o en el que ya cumple 4.5:1
  info: '#2360A5',
  infoContainer: '#E9F0F8',
  warning: '#B86E00', // ámbar: íconos, puntos y barras
  warningContainer: '#FBF2E2',
  onWarningContainer: '#8A5000',
  neutral: '#5E5E68',
  neutralContainer: '#EFEFF1',

  // Mapa (RouteMap de P2)
  mapLand: '#F3F3F1',
  mapGreen: '#E6EFE8',
  mapWater: '#E1EAF2',
};

// Un color por ruta (S4-11), el mismo en el mapa del despacho y en el teléfono (routeColorOf, por la
// letra: Ruta A = el primero). Ocho tonos que se distinguen entre sí, todos con 5:1 o más sobre blanco
// (C16). Sin rojo (es "no entregado") y sin morados ni magenta (decisión de Andrés, 30 oct: no se
// confunden con los botones principales). Los cinco primeros, los de un día normal, son los más
// distintos; el naranja va sexto (decisión de Andrés, 30 oct) y petróleo y oliva solo salen con 7 u 8.
export const routeColors = [
  '#1F6FB2', // azul
  '#2E7D32', // verde
  '#6D4C41', // café
  '#00796B', // turquesa
  '#8A6200', // dorado
  '#B4501A', // naranja (sexto: al lado de los pines rojos de sin asignar se confunde)
  '#0E5A73', // azul petróleo
  '#5C6B1A', // oliva
];
