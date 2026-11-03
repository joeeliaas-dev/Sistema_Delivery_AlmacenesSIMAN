// src/features/drivers/DriversSkeleton.js (dueño: P3)
// Esqueleto de Motoristas mientras llega la primera respuesta (no una lista vacía ni "0 motoristas"):
// tarjetas con nombre, zona, turno y la línea de acceso.
import { StyleSheet, View } from 'react-native';
import { Skeleton } from '../../components/Skeleton';
import { colors, radius, spacing } from '../../theme';

export function DriversSkeleton({ count = 3 }) {
  return (
    <View style={styles.stack} accessibilityLabel="Cargando motoristas" accessibilityRole="progressbar">
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.card}>
          <Skeleton width={150} height={18} />
          <Skeleton width={120} height={14} style={styles.mtXs} />
          <View style={[styles.row, styles.mtLg]}>
            <Skeleton width={96} height={44} />
            <Skeleton width={96} height={44} />
          </View>
          <Skeleton width="60%" height={14} style={styles.mtLg} />
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
  mtXs: { marginTop: spacing.xs },
  mtLg: { marginTop: spacing.lg },
});
