import { Platform } from 'react-native';
export const fonts = {
  regular: 'Roboto_400Regular',
  medium: 'Roboto_500Medium',
  bold: 'Roboto_700Bold',
};
const mono = Platform.select({
  ios: 'Menlo',
  default: 'monospace',
});
export const typography = {
  fonts,
  mono,
  display: {
    fontSize: 32,
    lineHeight: 38,
    fontFamily: fonts.bold,
    letterSpacing: -0.5,
  },
  eyebrow: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fonts.bold,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  headline: {
    fontSize: 24,
    lineHeight: 30,
    fontFamily: fonts.regular,
  },
  title: {
    fontSize: 18,
    lineHeight: 24,
    fontFamily: fonts.regular,
  },
  titleSmall: {
    fontSize: 16,
    lineHeight: 24,
    fontFamily: fonts.medium,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.regular,
  },
  bodyStrong: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.medium,
  },
  label: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.medium,
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fonts.regular,
  },
  captionStrong: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fonts.medium,
  },
  code: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: mono,
  },
};
