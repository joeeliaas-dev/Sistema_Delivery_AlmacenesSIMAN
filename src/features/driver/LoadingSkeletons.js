// src/features/driver/LoadingSkeletons.js (dueño: P3)
// Esqueletos con la forma de cada pantalla mientras llegan los datos (no pantalla vacía).
import { StyleSheet, View } from 'react-native';
import { Card } from '../../components/Card';
import { Skeleton } from '../../components/Skeleton';
import { colors, radius, spacing } from '../../theme';

/** Vista motorista: progreso, tarjeta de próxima parada y lista. */
export function DriverRouteSkeleton() {
  return (
    <View style={styles.stack} accessibilityLabel="Cargando ruta" accessibilityRole="progressbar">
      <Card variant="elevated">
        <View style={styles.row}>
          <Skeleton width={130} height={14} />
          <Skeleton width={90} height={14} />
        </View>
        <Skeleton height={8} round style={styles.mtLg} />
        <View style={[styles.row, styles.mtMd]}>
          <Skeleton width={90} height={12} />
          <Skeleton width={110} height={12} />
        </View>
      </Card>
      <View style={styles.hero}>
        <Skeleton width={150} height={12} tone="strong" />
        <Skeleton width="70%" height={26} tone="strong" style={styles.mtMd} />
        <Skeleton width="85%" height={14} tone="strong" style={styles.mtMd} />
        <Skeleton width="50%" height={14} tone="strong" style={styles.mtSm} />
        <View style={[styles.row, styles.mtXl]}>
          <Skeleton height={56} round tone="strong" style={styles.half} />
          <Skeleton height={56} round tone="strong" style={styles.half} />
        </View>
        <Skeleton height={56} round tone="strong" style={styles.mtSm} />
      </View>
      <Card variant="elevated">
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.listRow, i > 0 && styles.mtLg]}>
            <Skeleton width={36} height={36} round />
            <View style={styles.flex}>
              <Skeleton width="60%" height={14} />
              <Skeleton width="85%" height={12} style={styles.mtSm} />
            </View>
          </View>
        ))}
      </Card>
    </View>
  );
}

/** Confirmar entrega / No entregado: resumen, foto y firma. */
export function EvidenceSkeleton() {
  return (
    <View style={styles.stack} accessibilityLabel="Cargando envío" accessibilityRole="progressbar">
      <Card variant="elevated">
        <Skeleton width={150} height={14} />
        {[0, 1].map((i) => (
          <View key={i} style={[styles.listRow, styles.mtLg]}>
            <Skeleton width={44} height={44} style={styles.itemIcon} />
            <View style={styles.flex}>
              <Skeleton width="70%" height={14} />
              <Skeleton width="40%" height={12} style={styles.mtSm} />
            </View>
          </View>
        ))}
      </Card>
      <Skeleton width={130} height={14} style={styles.label} />
      <Skeleton height={112} style={styles.block} />
      <Skeleton width={120} height={14} style={styles.label} />
      <Skeleton height={144} style={styles.block} />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.lg },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  hero: { borderRadius: radius.xl, padding: spacing.xxl, backgroundColor: colors.primaryContainer },
  half: { flex: 1 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  flex: { flex: 1 },
  itemIcon: { borderRadius: radius.md },
  label: { marginLeft: spacing.xs, marginBottom: -spacing.sm },
  block: { borderRadius: radius.lg, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.cardBorder },
  mtSm: { marginTop: spacing.sm },
  mtMd: { marginTop: spacing.md },
  mtLg: { marginTop: spacing.lg },
  mtXl: { marginTop: spacing.xl },
});
