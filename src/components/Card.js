// src/components/Card.js (dueño: P3)
// Variantes:
//   elevated   blanca + borde cardBorder + sombra 1 (V1): la tarjeta normal de la app
//   container  gris lila (Prototipo 1)
//   low        más claro (Prototipo 1)
//   selected   morado claro (tarjeta de envío seleccionada en despacho)
//   primary    morado con degradado (Próxima parada)
//   surface    blanco sin borde (paneles del Centro de despacho)
// accent: color de la barra lateral de 4 px (V6), p. ej. tones.tertiary.accent para express.
// Sombra: la de la variante o la que se pase en `elevation` (0 a 3).
// Si recibe onPress se vuelve tocable: capa al 8 %, sombra un nivel más alta y escala 98 % (V8).
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, gradients, elevation as shadows, radius, spacing } from '../theme';

const VARIANTS = {
  elevated: {
    style: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.cardBorder },
    elevation: 1,
    layer: colors.onSurface,
  },
  container: { style: { backgroundColor: colors.surfaceContainer }, elevation: 0, layer: colors.onSurface },
  low: { style: { backgroundColor: colors.surfaceLow }, elevation: 0, layer: colors.onSurface },
  selected: { style: { backgroundColor: colors.primaryContainer }, elevation: 0, layer: colors.onPrimaryContainer },
  primary: {
    style: { ...gradients.primary, borderRadius: radius.xl, padding: spacing.xxl },
    elevation: 2,
    layer: colors.onPrimary,
  },
  surface: {
    style: { backgroundColor: colors.surface, borderRadius: radius.xl },
    elevation: 1,
    layer: colors.onSurface,
  },
};

export function Card({ variant = 'container', elevation, accent, padded = true, onPress, style, children }) {
  const v = VARIANTS[variant] ?? VARIANTS.container;
  const level = elevation ?? v.elevation;
  const base = [
    styles.base,
    !padded && styles.flush,
    v.style,
    shadows[level],
    accent && (padded ? styles.withAccent : styles.withAccentFlush),
    style,
  ];
  const bar = accent ? <View pointerEvents="none" style={[styles.accent, { backgroundColor: accent }]} /> : null;

  if (!onPress)
    return (
      <View style={base}>
        {bar}
        {children}
      </View>
    );
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [...base, pressed && shadows[Math.min(level + 1, 3)], pressed && styles.pressed]}
    >
      {({ pressed }) => (
        <>
          {bar}
          {pressed ? <View pointerEvents="none" style={[styles.layer, { backgroundColor: v.layer }]} /> : null}
          {children}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.lg, padding: spacing.xl, overflow: 'hidden' },
  flush: { padding: 0 },
  layer: { ...StyleSheet.absoluteFillObject, opacity: 0.08 },
  pressed: { transform: [{ scale: 0.98 }] },
  // Barra lateral (V6); el contenido se corre 4 px para no quedar encima
  accent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  withAccent: { paddingLeft: spacing.xl + 4 },
  withAccentFlush: { paddingLeft: 4 },
});

export default Card;
