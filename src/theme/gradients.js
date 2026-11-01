// src/theme/gradients.js (dueño: P3)
// Degradados sin paquetes: en web es CSS (backgroundImage) y en Android/iOS el
// experimental_backgroundImage de React Native 0.86. backgroundColor queda de respaldo.
import { Platform } from 'react-native';
import { colors } from './colors';

const linear = (angle, from, to, fallback = from) => {
  const css = `linear-gradient(${angle}, ${from}, ${to})`;
  return {
    backgroundColor: fallback,
    ...Platform.select({ web: { backgroundImage: css }, default: { experimental_backgroundImage: css } }),
  };
};

export const gradients = {
  // Próxima parada y barra de progreso (V: "degradado suave primary → #5B4A9C")
  primary: linear('135deg', colors.primary, colors.primaryDark),
  primaryBar: linear('90deg', colors.primary, colors.primaryDark),
};
