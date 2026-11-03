// src/features/driver/LoadingSkeletons.js (dueño: P3)
// Esqueletos con la forma de cada pantalla mientras llegan los datos (no pantalla vacía).
import { StyleSheet, View } from 'react-native';
import { Card } from '../../components/Card';
import { Skeleton } from '../../components/Skeleton';
import { colors, radius, spacing } from '../../theme';

/**
 * Vista motorista (rediseño 30 oct): la línea de progreso con su barra, la tarjeta blanca de la
 * próxima parada (cliente, dirección, referencia, hora y los dos botones) y la lista de paradas.
 * En gris: el color de la ruta todavía no se sabe.
 */
export function DriverRouteSkeleton() {
  return (
    <View style={styles.stack} accessibilityLabel="Cargando ruta" accessibilityRole="progressbar">
      <View>
        <View style={styles.row}>
          <Skeleton width={140} height={14} />
          <Skeleton width={48} height={16} />
        </View>
        <Skeleton height={4} round style={styles.mtSm} />
      </View>
      <View style={styles.nextCard}>
        <Skeleton width={150} height={12} />
        <Skeleton width="65%" height={24} style={styles.mtMd} />
        <Skeleton width="85%" height={16} style={styles.mtSm} />
        <Skeleton width="40%" height={14} style={styles.mtSm} />
        <Skeleton height={56} style={[styles.reference, styles.mtLg]} />
        <Skeleton width="45%" height={14} style={styles.mtLg} />
        <View style={[styles.row, styles.mtMd]}>
          <Skeleton height={44} style={styles.half} />
          <Skeleton height={44} style={styles.half} />
        </View>
      </View>
      <View style={styles.listCard}>
        <Skeleton width={140} height={16} />
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.listRow, styles.mtLg]}>
            <Skeleton width={32} height={32} round />
            <View style={styles.flex}>
              <Skeleton width="60%" height={14} />
              <Skeleton width="85%" height={12} style={styles.mtSm} />
            </View>
            <Skeleton width={44} height={14} />
          </View>
        ))}
      </View>
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
  nextCard: {
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.cardBorder,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  reference: { borderRadius: radius.md },
  listCard: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  half: { flex: 1 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
  itemIcon: { borderRadius: radius.md },
  label: { marginLeft: spacing.xs, marginBottom: -spacing.sm },
  block: { borderRadius: radius.lg, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.cardBorder },
  mtSm: { marginTop: spacing.sm },
  mtMd: { marginTop: spacing.md },
  mtLg: { marginTop: spacing.lg },
});
