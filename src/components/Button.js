// src/components/Button.js (dueño: P3)
// Botón de píldora del prototipo. Variantes:
//   filled             morado lleno (Completar entrega, Generar ruta óptima)
//   tonal              morado claro (Google Maps)
//   outlined           borde gris y texto morado (Vista motorista)
//   surface            fondo blanco y texto morado (Waze, sobre la tarjeta morada)
//   outlinedOnPrimary  borde blanco sobre la tarjeta morada (Llegué al destino)
//   text               solo texto (Limpiar)
// Al tocar: capa del color del texto al 12 % (estado de Material 3) y una leve escala.
// Deshabilitado: gris on-surface al 10 % con texto al 40 %; text y outlined quedan sin fondo.
// size="sm" se ve de 32 px, pero el área de toque mide 44 px de alto en todas las plataformas.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, elevation, radius, spacing, typography } from '../theme';
import { Icon } from './Icon';

const VARIANTS = {
  filled: { bg: colors.primary, fg: colors.onPrimary },
  tonal: { bg: colors.primaryContainer, fg: colors.onPrimaryContainer },
  outlined: { bg: 'transparent', fg: colors.primary, border: colors.outline },
  surface: { bg: colors.surface, fg: colors.primary },
  outlinedOnPrimary: { bg: 'transparent', fg: colors.onPrimary, border: colors.onPrimaryBorder },
  text: { bg: 'transparent', fg: colors.primary },
};

const HEIGHTS = { lg: 56, md: 48, sm: 32 };

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
  // sm: el Pressable exterior mide 44 de alto (hitSlop no aplica en web) y adentro va el botón de 32
  const small = size === 'sm';

  const visual = (pressed) => [
    styles.base,
    { height: HEIGHTS[size] ?? HEIGHTS.lg, backgroundColor: disabled && !ghost ? colors.disabledContainer : v.bg },
    v.border && { borderWidth: 1, borderColor: disabled ? colors.disabledContainer : v.border },
    variant === 'filled' && !disabled && (pressed ? elevation[2] : elevation[1]),
    pressed && !disabled && styles.pressed,
  ];

  const content = (pressed) => (
    <>
      {pressed && !disabled ? (
        <View pointerEvents="none" style={[styles.stateLayer, { backgroundColor: v.fg }]} />
      ) : null}
      <View style={styles.content}>
        {icon ? <Icon name={icon} size={small ? 16 : 20} color={fg} /> : null}
        {title ? (
          <Text
            numberOfLines={1}
            style={[
              size === 'lg' && variant === 'filled' ? styles.labelLarge : styles.label,
              styles.shrink,
              { color: fg },
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
      accessibilityState={{ disabled }}
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
  hitArea: { minHeight: 44, justifyContent: 'center' },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, maxWidth: '100%' },
  label: typography.label,
  // En pantallas de 360 px el texto se recorta con … en vez de partirse en dos líneas
  shrink: { flexShrink: 1 },
  labelLarge: { ...typography.label, fontSize: 16, lineHeight: 24 },
  pressed: { transform: [{ scale: 0.98 }] },
  stateLayer: { ...StyleSheet.absoluteFillObject, borderRadius: radius.full, opacity: 0.12 },
});

export default Button;
