// src/components/Button.js (dueño: P3)
// Rediseño (30 oct): tres variantes, radio de 8 px y sin sombra.
//   primary    sólido morado: la única acción principal de la pantalla
//   secondary  blanco con borde gris y texto casi negro
//   text       solo texto morado (acciones de menos peso: "No se pudo entregar", "Limpiar")
// Los nombres viejos siguen funcionando: filled → primary; tonal, outlined, surface y
// outlinedOnPrimary → secondary.
// El ícono es opcional; úsenlo solo cuando ayuda a reconocer el botón (navegar, llamar, cámara).
// Al tocar: capa del color del texto al 10 %. Deshabilitado: gris al 8 % con texto al 38 %.
// size="sm" se ve de 36 px, pero el área de toque mide 44 px de alto en todas las plataformas.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';
import { Icon } from './Icon';

const PRIMARY = { bg: colors.primary, fg: colors.onPrimary };
const SECONDARY = { bg: colors.white, fg: colors.onSurface, border: colors.outlineVariant };
const TEXT = { bg: 'transparent', fg: colors.primary };

const VARIANTS = {
  primary: PRIMARY,
  secondary: SECONDARY,
  text: TEXT,
  filled: PRIMARY,
  tonal: SECONDARY,
  outlined: SECONDARY,
  surface: SECONDARY,
  outlinedOnPrimary: SECONDARY,
};

const HEIGHTS = { lg: 52, md: 44, sm: 36 };

export function Button({
  title,
  icon,
  iconRight,
  onPress,
  variant = 'primary',
  size = 'lg',
  disabled = false,
  accessibilityLabel,
  style,
}) {
  const v = VARIANTS[variant] ?? PRIMARY;
  const fg = disabled ? colors.disabledContent : v.fg;
  const solid = v === PRIMARY;
  // sm: el Pressable exterior mide 44 de alto (hitSlop no aplica en web) y adentro va el botón de 36
  const small = size === 'sm';

  const visual = (pressed) => [
    styles.base,
    small && styles.baseSmall,
    v === TEXT && styles.baseText,
    { height: HEIGHTS[size] ?? HEIGHTS.lg, backgroundColor: disabled && solid ? colors.disabledContainer : v.bg },
    v.border && { borderWidth: 1, borderColor: v.border },
    pressed && !disabled && styles.pressed,
  ];

  const content = (pressed) => (
    <>
      {pressed && !disabled ? (
        <View pointerEvents="none" style={[styles.stateLayer, { backgroundColor: v.fg }]} />
      ) : null}
      <View style={styles.content}>
        {icon ? <Icon name={icon} size={small ? 18 : 20} color={fg} /> : null}
        {title ? (
          <Text
            numberOfLines={1}
            style={[size === 'lg' ? styles.labelLarge : styles.label, styles.shrink, { color: fg }]}
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
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  baseSmall: { paddingHorizontal: spacing.md },
  baseText: { paddingHorizontal: spacing.md },
  hitArea: { minHeight: 44, justifyContent: 'center' },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, maxWidth: '100%' },
  label: typography.label,
  // En pantallas de 360 px el texto se recorta con … en vez de partirse en dos líneas
  shrink: { flexShrink: 1 },
  labelLarge: { ...typography.label, fontSize: 16, lineHeight: 22 },
  pressed: { opacity: 0.92 },
  stateLayer: { ...StyleSheet.absoluteFillObject, borderRadius: radius.md, opacity: 0.1 },
});

export default Button;
