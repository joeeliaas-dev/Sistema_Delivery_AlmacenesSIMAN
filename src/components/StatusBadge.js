// src/components/StatusBadge.js (dueño: P3)
// Píldora de estado del envío con el color de su estado (V5, statusTone):
// pendiente naranja, asignado y en ruta azul, entregado verde, no entregado rojo, devuelto gris.
// "En ruta" lleva el punto del prototipo; el resto, su ícono.
import { StyleSheet, Text, View } from 'react-native';
import { STATUS } from '../constants';
import { radius, spacing, statusTone, typography } from '../theme';
import { Icon } from './Icon';

export function StatusBadge({ status }) {
  if (!Object.values(STATUS).includes(status)) return null;
  const t = statusTone(status);
  const dot = status === STATUS.EN_RUTA;
  return (
    <View style={[styles.base, { backgroundColor: t.bg }]}>
      {dot ? (
        <View style={[styles.dot, { backgroundColor: t.accent }]} />
      ) : (
        <Icon name={t.icon} size={14} color={t.fg} />
      )}
      <Text style={[styles.label, { color: t.fg }]}>{t.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 32,
    paddingHorizontal: spacing.md,
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
