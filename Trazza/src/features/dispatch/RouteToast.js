// src/features/dispatch/RouteToast.js  (dueño: P2)
// Resultado de "Generar ruta de esta zona" (rediseño 30 oct): una fila compacta con el punto del
// color de la ruta, "Ruta B lista · Kevin" y debajo "16.1 km · termina 17:03 · ahorra 1.2 km".
// Toca para abrir el seguimiento. Mientras createRoute calcula, "Calculando la ruta…".
// Entra con useEnter (sube 8 px, 200 ms; nada si "reducir movimiento"); `key` la repite al cambiar.
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography, useEnter } from '../../theme';
import { savedKm } from './dispatchMath';

function Enter({ children }) {
  const enter = useEnter(0);
  return <Animated.View style={enter}>{children}</Animated.View>;
}

function Loading() {
  return (
    <View style={styles.card} accessibilityLiveRegion="polite">
      <ActivityIndicator color={colors.primary} />
      <Text style={styles.title}>Calculando la ruta…</Text>
    </View>
  );
}

function Result({ route, end, color, driverName, onPress }) {
  const saved = savedKm(route);
  const meta = [
    `${(route.totalKm ?? 0).toFixed(1)} km`,
    end ? `termina ${end}` : null,
    saved >= 0.05 ? `ahorra ${saved.toFixed(1)} km` : null,
  ].filter(Boolean);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={`${route.code} lista. Ver seguimiento`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={[styles.dot, { backgroundColor: color ?? colors.success }]} />
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {route.code} lista{driverName ? ` · ${driverName}` : ''}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {meta.join(' · ')}
        </Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

/**
 * @param {{ loading?: boolean, route?: object, end?: string|null, color?: string, driverName?: string, onPress?: () => void }} props
 *   end: "HH:MM" de routeTimes (src/lib/eta), la misma hora que ve el motorista
 */
export function RouteToast({ loading = false, route, end, color, driverName, onPress }) {
  if (loading)
    return (
      <Enter key="loading">
        <Loading />
      </Enter>
    );
  if (!route) return null;
  return (
    <Enter key={route.id}>
      <Result route={route} end={end} color={color} driverName={driverName} onPress={onPress} />
    </Enter>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.white,
  },
  pressed: { backgroundColor: colors.surfaceContainer },
  dot: { width: 10, height: 10, borderRadius: 5 },
  text: { flex: 1, minWidth: 0 },
  title: { ...typography.bodyStrong, color: colors.onSurface },
  meta: { ...typography.caption, color: colors.onSurfaceVariant },
  chevron: { ...typography.title, color: colors.onSurfaceVariant },
});

export default RouteToast;
