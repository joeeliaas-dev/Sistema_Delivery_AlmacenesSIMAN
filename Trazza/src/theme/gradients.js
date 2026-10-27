import { Platform } from 'react-native';
import { colors } from './colors';
const linear = (angle, from, to, fallback = from) => {
  const css = `linear-gradient(${angle}, ${from}, ${to})`;
  return {
    backgroundColor: fallback,
    ...Platform.select({
      web: {
        backgroundImage: css,
      },
      default: {
        experimental_backgroundImage: css,
      },
    }),
  };
};
export const gradients = {
  primary: linear('135deg', colors.primary, colors.primaryDark),
  primaryBar: linear('90deg', colors.primary, colors.primaryDark),
};
