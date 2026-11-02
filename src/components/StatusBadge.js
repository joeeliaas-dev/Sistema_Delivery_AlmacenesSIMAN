// src/components/StatusBadge.js (dueño: P3)
// Píldora de estado del envío con el color de su estado (V5, statusTone):
// pendiente naranja, asignado y en ruta azul, entregado verde, no entregado rojo, devuelto gris.
// Rediseño (30 oct): etiqueta chica con un punto de color, sin ícono. quiet: gris oscuro, para el
// encabezado del motorista, donde el azul se confundía con el color de la Ruta A (decisión de Andrés).
import { StyleSheet, Text, View } from 'react-native';
import { STATUS } from '../constants';
import { colors, radius, spacing, statusTone, typography } from '../theme';

const QUIET = { accent: colors.onSurface, fg: colors.onSurface, bg: colors.surfaceHigh };

export function StatusBadge({ status, quiet = false }) {
  if (!Object.values(STATUS).includes(status)) return null;
  const t = quiet ? { ...statusTone(status), ...QUIET } : statusTone(status);
  return (
    <View style={[styles.base, { backgroundColor: t.bg }]}>
      <View style={[styles.dot, { backgroundColor: t.accent }]} />
      <Text style={[styles.label, { color: t.fg }]}>{t.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 24,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: typography.captionStrong,
});

export default StatusBadge;
