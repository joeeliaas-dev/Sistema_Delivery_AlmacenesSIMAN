// src/components/Card.js (dueño: P3)
// Rediseño (30 oct): blanca con borde gris de 1 px, radio 8 y sin sombra ni degradado.
// Variantes:
//   elevated   blanca + borde: la tarjeta normal de la app
//   container  gris neutro muy claro (bloques secundarios)
//   low        casi blanca
//   selected   morado muy claro con borde morado (lo seleccionado)
//   primary    igual que elevated (era la tarjeta morada de Próxima parada); el color lo da accent
//   surface    igual que elevated (paneles del Centro de despacho)
// accent: color de la barra lateral de 4 px (V6), p. ej. tones.tertiary.accent para express.
// Sombra: la de la variante o la que se pase en `elevation` (0 a 3).
// Si recibe onPress se vuelve tocable: capa al 8 % al presionar.
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, elevation as shadows, radius, spacing } from '../theme';

const WHITE = { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.cardBorder };

const VARIANTS = {
  elevated: { style: WHITE, elevation: 0, layer: colors.onSurface },
  container: { style: { backgroundColor: colors.surfaceContainer }, elevation: 0, layer: colors.onSurface },
  low: { style: { backgroundColor: colors.surfaceLow }, elevation: 0, layer: colors.onSurface },
  selected: {
    style: { backgroundColor: colors.primaryContainer, borderWidth: 1, borderColor: colors.primary },
    elevation: 0,
    layer: colors.onPrimaryContainer,
  },
  primary: { style: WHITE, elevation: 0, layer: colors.onSurface },
  surface: { style: WHITE, elevation: 0, layer: colors.onSurface },
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
      style={({ pressed }) => [...base, pressed && styles.pressed]}
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
  base: { borderRadius: radius.lg, padding: spacing.lg, overflow: 'hidden' },
  flush: { padding: 0 },
  layer: { ...StyleSheet.absoluteFillObject, opacity: 0.08 },
  pressed: { opacity: 0.96 },
  // Barra lateral (V6); el contenido se corre 4 px para no quedar encima
  accent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  withAccent: { paddingLeft: spacing.lg + 4 },
  withAccentFlush: { paddingLeft: 4 },
});

export default Card;
