// src/features/dispatch/Counters.js  (dueño: P2)
// Pendientes / En ruta / Entregados con el lenguaje del Prototipo 2 (V2, V3, V5, V7, V8):
// tarjeta blanca, IconTile del color de su estado, número grande (sin conteo animado, N30) y,
// desde 400 px de ancho, una píldora de contexto.
// El número va ANTES de la etiqueta (StatCard la pone antes): el e2e lee "51 Pendientes" (T4).
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { IconTile } from '../../components/IconTile';
import { colors, elevation, radius, spacing, tones, typography } from '../../theme';

const WIDE = 400;

function Counter({ icon, tone, label, value, pill, wide }) {
  const t = tones[tone];
  return (
    <View style={styles.box} accessible accessibilityLabel={`${label}: ${value}`}>
      <IconTile icon={icon} tone={tone} size={36} />
      <Text style={styles.value} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      {wide && pill ? (
        <View style={[styles.pill, { backgroundColor: t.bg }]}>
          <Text style={[styles.pillText, { color: t.fg }]} numberOfLines={1}>
            {pill}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * @param {{ pendientes: number, enRuta: number, entregados: number,
 *   pills?: { pendientes?: string, enRuta?: string, entregados?: string } }} props
 */
export function Counters({ pendientes, enRuta, entregados, pills = {} }) {
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;
  return (
    <View style={styles.row}>
      <Counter
        icon="schedule"
        tone="warning"
        label="Pendientes"
        value={pendientes}
        pill={pills.pendientes}
        wide={wide}
      />
      <Counter icon="two_wheeler" tone="info" label="En ruta" value={enRuta} pill={pills.enRuta} wide={wide} />
      <Counter
        icon="task_alt"
        tone="success"
        label="Entregados"
        value={entregados}
        pill={pills.entregados}
        wide={wide}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  box: {
    flex: 1,
    minWidth: 0,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.white,
    ...elevation[1],
  },
  value: {
    ...typography.display,
    fontSize: 28,
    lineHeight: 34,
    color: colors.onSurface,
    fontVariant: ['tabular-nums'],
    marginTop: spacing.sm,
  },
  label: { ...typography.caption, color: colors.onSurfaceVariant },
  pill: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  pillText: { ...typography.captionStrong },
});

export default Counters;
