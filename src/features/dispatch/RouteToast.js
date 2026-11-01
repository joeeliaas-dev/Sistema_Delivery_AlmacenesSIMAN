// src/features/dispatch/RouteToast.js  (dueño: P2)
// Aviso "Ruta optimizada" bajo el mapa, con el lenguaje del Prototipo 2: IconTile verde,
// km grandes en display y fin estimado y ahorro como píldoras (V2, V3, V7).
// Mientras createRoute calcula muestra un estado de carga. Entra con useEnter (V8: sube 8 px,
// 200 ms, nada si "reducir movimiento", se detiene al desmontar); `key` la repite al cambiar.
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../../components/Icon';
import { IconTile } from '../../components/IconTile';
import { colors, elevation, radius, spacing, tones, typography, useEnter } from '../../theme';
import { formatClock, savedKm } from './dispatchMath';

function Pill({ icon, tone, children }) {
  const t = tones[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }]}>
      <Icon name={icon} size={14} color={t.fg} />
      <Text style={[styles.pillText, { color: t.fg }]} numberOfLines={1}>
        {children}
      </Text>
    </View>
  );
}

function Enter({ children }) {
  const enter = useEnter(0);
  return <Animated.View style={enter}>{children}</Animated.View>;
}

function Loading() {
  return (
    <View style={styles.card} accessibilityLiveRegion="polite">
      <View style={[styles.tile, { backgroundColor: tones.primary.bg }]}>
        <ActivityIndicator color={tones.primary.accent} />
      </View>
      <View style={styles.text}>
        <Text style={styles.title}>Calculando la ruta óptima…</Text>
        <Text style={styles.caption}>Express primero, luego el orden más corto</Text>
      </View>
    </View>
  );
}

function Result({ route, driverName, onPress }) {
  const saved = savedKm(route);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={`${route.code} optimizada. Ver seguimiento`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <IconTile icon="task_alt" tone="success" size={48} />
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {route.code} optimizada{driverName ? ` · ${driverName}` : ''}
        </Text>
        <Text style={styles.km} numberOfLines={1}>
          {(route.totalKm ?? 0).toFixed(1)}
          <Text style={styles.kmUnit}> km</Text>
        </Text>
        <View style={styles.pills}>
          <Pill icon="schedule" tone="info">
            Fin {formatClock(route.estEnd)}
          </Pill>
          {saved >= 0.05 ? (
            <Pill icon="trending_down" tone="success">
              Ahorro {saved.toFixed(1)} km
            </Pill>
          ) : null}
        </View>
      </View>
      <Icon name="chevron_right" size={24} color={colors.onSurfaceVariant} />
    </Pressable>
  );
}

/**
 * @param {{ loading?: boolean, route?: object, driverName?: string, onPress?: () => void }} props
 */
export function RouteToast({ loading = false, route, driverName, onPress }) {
  if (loading)
    return (
      <Enter key="loading">
        <Loading />
      </Enter>
    );
  if (!route) return null;
  return (
    <Enter key={route.id}>
      <Result route={route} driverName={driverName} onPress={onPress} />
    </Enter>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 64,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.white,
    ...elevation[2],
  },
  pressed: { transform: [{ scale: 0.98 }], backgroundColor: colors.surfaceLow },
  tile: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0 },
  title: { ...typography.captionStrong, color: colors.onSurfaceVariant },
  caption: { ...typography.caption, color: colors.onSurfaceVariant, marginTop: spacing.xxs },
  km: { ...typography.display, color: colors.onSurface, fontVariant: ['tabular-nums'] },
  kmUnit: { ...typography.title, color: colors.onSurfaceVariant },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  pillText: typography.captionStrong,
});

export default RouteToast;
