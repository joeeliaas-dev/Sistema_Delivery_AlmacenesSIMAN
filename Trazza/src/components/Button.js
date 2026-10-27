import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, elevation, radius, spacing, typography } from '../theme';
import { Icon } from './Icon';
const VARIANTS = {
  filled: {
    bg: colors.primary,
    fg: colors.onPrimary,
  },
  tonal: {
    bg: colors.primaryContainer,
    fg: colors.onPrimaryContainer,
  },
  outlined: {
    bg: 'transparent',
    fg: colors.primary,
    border: colors.outline,
  },
  surface: {
    bg: colors.surface,
    fg: colors.primary,
  },
  outlinedOnPrimary: {
    bg: 'transparent',
    fg: colors.onPrimary,
    border: colors.onPrimaryBorder,
  },
  text: {
    bg: 'transparent',
    fg: colors.primary,
  },
};
const HEIGHTS = {
  lg: 56,
  md: 48,
  sm: 32,
};
export function Button({
  title,
  icon,
  iconRight,
  onPress,
  variant = 'filled',
  size = 'lg',
  disabled = false,
  accessibilityLabel,
  style,
}) {
  const v = VARIANTS[variant] ?? VARIANTS.filled;
  const fg = disabled ? colors.disabledContent : v.fg;
  const ghost = variant === 'text' || variant === 'outlined' || variant === 'outlinedOnPrimary';
  const small = size === 'sm';
  const visual = (pressed) => [
    styles.base,
    {
      height: HEIGHTS[size] ?? HEIGHTS.lg,
      backgroundColor: disabled && !ghost ? colors.disabledContainer : v.bg,
    },
    v.border && {
      borderWidth: 1,
      borderColor: disabled ? colors.disabledContainer : v.border,
    },
    variant === 'filled' && !disabled && (pressed ? elevation[2] : elevation[1]),
    pressed && !disabled && styles.pressed,
  ];
  const content = (pressed) => (
    <>
      {pressed && !disabled ? (
        <View
          pointerEvents="none"
          style={[
            styles.stateLayer,
            {
              backgroundColor: v.fg,
            },
          ]}
        />
      ) : null}
      <View style={styles.content}>
        {icon ? <Icon name={icon} size={small ? 16 : 20} color={fg} /> : null}
        {title ? (
          <Text
            numberOfLines={1}
            style={[
              size === 'lg' && variant === 'filled' ? styles.labelLarge : styles.label,
              styles.shrink,
              {
                color: fg,
              },
            ]}
          >
            {title}
          </Text>
        ) : null}
        {iconRight ? <Icon name={iconRight} size={20} color={fg} /> : null}
      </View>
    </>
  );
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{
        disabled,
      }}
      style={({ pressed }) => (small ? [styles.hitArea, style] : [...visual(pressed), style])}
    >
      {({ pressed }) => (small ? <View style={visual(pressed)}>{content(pressed)}</View> : content(pressed))}
    </Pressable>
  );
}
const styles = StyleSheet.create({
  base: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hitArea: {
    minHeight: 44,
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: '100%',
  },
  label: typography.label,
  shrink: {
    flexShrink: 1,
  },
  labelLarge: {
    ...typography.label,
    fontSize: 16,
    lineHeight: 24,
  },
  pressed: {
    transform: [
      {
        scale: 0.98,
      },
    ],
  },
  stateLayer: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.full,
    opacity: 0.12,
  },
});
export default Button;
