// src/features/vehicles/FleetSkeletons.js (dueño: P3)
// Esqueletos de Vehículos y turnos mientras llega la primera respuesta (no listas vacías ni ceros):
// tarjetas de motorista (nombre, zona, chips de vehículo, turno y Guardar) y renglones de vehículo.
import { StyleSheet, View } from 'react-native';
import { Skeleton } from '../../components/Skeleton';
import { colors, radius, spacing } from '../../theme';

export function DriverCardsSkeleton({ count = 3 }) {
  return (
    <View style={styles.stack} accessibilityLabel="Cargando motoristas" accessibilityRole="progressbar">
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.card}>
          <Skeleton width={150} height={18} />
          <Skeleton width={120} height={14} style={styles.mtXs} />
          <Skeleton width={60} height={12} style={styles.mtLg} />
          <View style={[styles.row, styles.mtSm]}>
            <Skeleton width={120} height={40} round />
            <Skeleton width={120} height={40} round />
          </View>
          <View style={[styles.row, styles.mtLg]}>
            <Skeleton width={96} height={44} />
            <Skeleton width={96} height={44} />
          </View>
          <Skeleton height={44} style={styles.mtLg} />
        </View>
      ))}
    </View>
  );
}

export function VehicleRowsSkeleton({ count = 5 }) {
  return (
    <View style={styles.list} accessibilityLabel="Cargando vehículos" accessibilityRole="progressbar">
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.vehRow, i < count - 1 && styles.divider]}>
          <Skeleton width={24} height={24} round />
          <View style={styles.flex}>
            <Skeleton width="45%" height={14} />
            <Skeleton width="65%" height={12} style={styles.mtXs} />
          </View>
          <Skeleton width={72} height={12} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  list: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
  },
  vehRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 64,
    paddingHorizontal: spacing.lg,
  },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  mtXs: { marginTop: spacing.xs },
  mtSm: { marginTop: spacing.sm },
  mtLg: { marginTop: spacing.lg },
});
