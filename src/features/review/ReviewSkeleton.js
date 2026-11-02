// src/features/review/ReviewSkeleton.js (dueño: P3)
// Revisar ubicaciones mientras llega la primera respuesta (no "Todas las direcciones están
// revisadas" ni "Quedan 0"): el mapa, la tarjeta del pedido elegido y la fila de la cola.
// En escritorio, tarjeta y cola a la izquierda y el mapa a la derecha, como la pantalla.
import { StyleSheet, View } from 'react-native';
import { Skeleton } from '../../components/Skeleton';
import { colors, radius, spacing } from '../../theme';

function SelectedSkeleton() {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Skeleton width={90} height={12} />
        <Skeleton width={70} height={12} />
      </View>
      <Skeleton width="60%" height={18} style={styles.mtSm} />
      <Skeleton width="85%" height={14} style={styles.mtSm} />
      <Skeleton height={52} style={[styles.reference, styles.mtMd]} />
      <Skeleton width="50%" height={14} style={styles.mtMd} />
      <Skeleton height={44} style={styles.mtLg} />
      <Skeleton height={44} style={styles.mtSm} />
    </View>
  );
}

function QueueSkeleton({ count }) {
  return (
    <View style={styles.list}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.item}>
          <View style={styles.flex}>
            <Skeleton width={80} height={12} />
            <Skeleton width="55%" height={14} style={styles.mtXs} />
            <Skeleton width="80%" height={12} style={styles.mtXs} />
          </View>
          <Skeleton width={64} height={20} round />
        </View>
      ))}
    </View>
  );
}

export function ReviewSkeleton({ wide }) {
  const map = <Skeleton height={wide ? 640 : 280} style={styles.map} />;
  return (
    <View accessibilityLabel="Cargando pedidos" accessibilityRole="progressbar">
      {wide ? (
        <View style={styles.columns}>
          <View style={styles.side}>
            <SelectedSkeleton />
            <QueueSkeleton count={4} />
          </View>
          <View style={styles.flex}>{map}</View>
        </View>
      ) : (
        <View style={styles.stack}>
          {map}
          <SelectedSkeleton />
          <QueueSkeleton count={3} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.lg },
  columns: { flexDirection: 'row', gap: spacing.lg },
  side: { width: 400, gap: spacing.md },
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  map: { borderRadius: radius.lg },
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  reference: { borderRadius: radius.md },
  list: { gap: spacing.sm },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 64,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.white,
  },
  mtXs: { marginTop: spacing.xs },
  mtSm: { marginTop: spacing.sm },
  mtMd: { marginTop: spacing.md },
  mtLg: { marginTop: spacing.lg },
});
