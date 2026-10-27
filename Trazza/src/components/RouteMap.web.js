import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';
import { MapLegend, StopPin } from './RouteMapParts';
import { StatusBadge } from './StatusBadge';
const COLLAPSED = 5;
export function RouteMap({ depot, stops = [], showPath = false, onStopPress, selectedId }) {
  const [expanded, setExpanded] = useState(false);
  const canCollapse = stops.length > COLLAPSED;
  let visible = expanded || !canCollapse ? stops : stops.slice(0, COLLAPSED);
  const picked = stops.find((s) => s.id === selectedId);
  if (picked && !visible.includes(picked)) visible = [...visible, picked];
  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.note}>
          {showPath ? 'Paradas en el orden de la ruta.' : 'Envíos en el mapa.'} El mapa con calles solo se ve en la app
          del teléfono.
        </Text>
        <MapLegend style={styles.legend} />
      </View>

      {}
      <View style={styles.list}>
        {depot ? (
          <View style={styles.row}>
            <View style={styles.depot}>
              <Text style={styles.depotText}>S</Text>
            </View>
            <View style={styles.text}>
              <Text style={styles.title} numberOfLines={1}>
                {depot.name}
              </Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                Salida
              </Text>
            </View>
          </View>
        ) : null}

        {visible.map((stop) => {
          const selected = stop.id === selectedId;
          return (
            <Pressable
              key={stop.id}
              onPress={() => onStopPress?.(stop.id)}
              accessibilityRole="button"
              accessibilityState={{
                selected,
              }}
              style={({ pressed }) => [styles.row, selected && styles.rowSelected, pressed && styles.rowPressed]}
            >
              {showPath ? <View style={styles.rail} /> : null}
              <StopPin label={stop.label} priority={stop.priority} status={stop.status} />
              <View style={styles.text}>
                <Text style={styles.title} numberOfLines={1}>
                  {stop.title ?? stop.id}
                </Text>
                <Text style={styles.subtitle} numberOfLines={1}>
                  {stop.subtitle ?? stop.id}
                </Text>
              </View>
              <StatusBadge status={stop.status} />
            </Pressable>
          );
        })}

        {canCollapse ? (
          <Pressable
            onPress={() => setExpanded((v) => !v)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.more, pressed && styles.rowPressed]}
          >
            <Text style={styles.moreText}>{expanded ? 'Ver menos' : `Ver todas (${stops.length})`}</Text>
          </Pressable>
        ) : null}
        {!stops.length ? <Text style={styles.empty}>Sin paradas para mostrar.</Text> : null}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.lg,
    backgroundColor: colors.mapLand,
    padding: spacing.md,
    gap: spacing.md,
  },
  header: {
    gap: spacing.sm,
  },
  note: {
    ...typography.caption,
    color: colors.onSurfaceVariant,
  },
  legend: {},
  list: {
    gap: spacing.xxs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  rowSelected: {
    backgroundColor: colors.primaryContainer,
  },
  rowPressed: {
    opacity: 0.85,
  },
  rail: {
    position: 'absolute',
    left: spacing.sm + 15,
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: colors.primary,
    opacity: 0.35,
  },
  depot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.white,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  depotText: {
    ...typography.captionStrong,
    color: colors.white,
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    ...typography.bodyStrong,
    color: colors.onSurface,
  },
  subtitle: {
    ...typography.caption,
    color: colors.onSurfaceVariant,
  },
  more: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  moreText: {
    ...typography.label,
    color: colors.primary,
  },
  empty: {
    ...typography.caption,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    padding: spacing.lg,
  },
});
export default RouteMap;
