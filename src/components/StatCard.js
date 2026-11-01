// src/components/StatCard.js (dueño: P3)
// Métrica del Prototipo 2 (V2, V3, V7): tarjeta blanca con IconTile, etiqueta, número grande y
// píldora opcional. Sin círculo decorativo ni conteo animado: el número aparece directo (N30).
// <StatCard icon="schedule" tone="warning" label="Pendientes" value={51} pill="+3 hoy" pillTone="warning"
//           compact? decimals? suffix? />
// compact: versión de fila para 360 px (ícono de 36, número de 24).
import { StyleSheet, Text, View } from 'react-native';
import { colors, elevation, radius, spacing, tones, typography } from '../theme';
import { IconTile } from './IconTile';

export function StatCard({
  icon,
  tone = 'primary',
  label,
  value,
  pill,
  pillTone,
  compact = false,
  decimals = 0,
  suffix = '',
  style,
}) {
  const p = tones[pillTone ?? tone] ?? tones.primary;
  const text = typeof value === 'number' ? value.toFixed(decimals) : value;

  return (
    <View
      style={[styles.card, compact && styles.cardCompact, style]}
      accessible
      accessibilityLabel={`${label}: ${typeof value === 'number' ? value.toFixed(decimals) : value}${suffix}`}
    >
      <IconTile icon={icon} tone={tone} size={compact ? 36 : 48} />
      <Text style={[styles.label, compact && styles.labelCompact]} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.row}>
        <Text style={[styles.value, compact && styles.valueCompact]} numberOfLines={1}>
          {text}
          {suffix}
        </Text>
        {pill ? (
          <View style={[styles.pill, { backgroundColor: p.bg }]}>
            <Text style={[styles.pillText, { color: p.fg }]} numberOfLines={1}>
              {pill}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 0,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.white,
    overflow: 'hidden',
    ...elevation[1],
  },
  cardCompact: { padding: spacing.md, borderRadius: radius.md },
  label: { ...typography.body, color: colors.onSurfaceVariant, marginTop: spacing.md },
  labelCompact: { ...typography.caption, marginTop: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  value: { ...typography.display, color: colors.onSurface, fontVariant: ['tabular-nums'], flexShrink: 1 },
  valueCompact: { fontSize: 24, lineHeight: 30 },
  pill: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  pillText: { ...typography.captionStrong, fontFamily: typography.fonts.bold },
});

export default StatCard;
