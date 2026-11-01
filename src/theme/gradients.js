// src/theme/gradients.js (dueño: P3)
// Rediseño (30 oct): sin degradados en pantalla. Se queda el export para no romper a quien lo
// importa; cada "degradado" es ahora un color sólido. No usar en pantallas nuevas.
import { colors } from './colors';

export const gradients = {
  primary: { backgroundColor: colors.primary },
  primaryBar: { backgroundColor: colors.primary },
};
