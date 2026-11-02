// src/features/dispatch/ShipmentCard.js  (dueño: P2)
// Rediseño (30 oct): el envío como fila compacta de lista ("Todos los pedidos") y su detalle en el
// panel lateral del pedido elegido.
//   ShipmentCard    fila: cliente y ruta (punto de color) arriba; código, hora y dirección abajo, en gris
//   ShipmentDetail  detalle del pedido elegido: cliente, dirección y datos en líneas cortas
// Express va como etiqueta chica (color de express), no como barra. Con onOpenRoute, "Ruta X ›" abre
// el seguimiento. carriedFrom ("8 oct"): viene de un día anterior.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBadge } from '../../components/StatusBadge';
import { PRIORITY, STATUS } from '../../constants';
import { colors, fonts, radius, spacing, tones, typography } from '../../theme';
import { itemCount } from './dispatchMath';

function ExpressTag() {
  return (
    <View style={[styles.tag, { backgroundColor: tones.tertiary.bg }]}>
      <Text style={[styles.tagText, { color: tones.tertiary.fg }]}>Express</Text>
    </View>
  );
}

// Ruta del envío: punto del color de la ruta y "Ruta B"; sin ruta, "Sin asignar" en gris
function RouteLabel({ assignment, routeCode, routeColor, onOpenRoute }) {
  const body = (pressed) => (
    <View style={[styles.route, pressed && styles.routePressed]}>
      {routeColor ? <View style={[styles.dot, { backgroundColor: routeColor }]} /> : null}
      <Text style={[styles.routeText, !assignment && styles.muted]} numberOfLines={1}>
        {assignment ? (routeCode ?? assignment) : 'Sin asignar'}
        {onOpenRoute ? ' ›' : ''}
      </Text>
    </View>
  );
  if (!onOpenRoute) return body(false);
  return (
    <Pressable
      onPress={onOpenRoute}
      accessibilityRole="link"
      accessibilityLabel={`Ver seguimiento de la ${routeCode ?? 'ruta'}`}
      style={styles.routeTarget}
    >
      {({ pressed }) => body(pressed)}
    </Pressable>
  );
}

export function ShipmentCard({
  shipment,
  assignment,
  routeCode,
  routeColor,
  carriedFrom,
  selected = false,
  onPress,
  onOpenRoute,
}) {
  const s = shipment;
  const meta = [
    `${s.code} · ${s.scheduledTime}`,
    [s.address?.text, s.address?.municipio].filter(Boolean).join(', '),
    carriedFrom ? `desde el ${carriedFrom}` : null,
  ].filter(Boolean);
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${s.code}, ${s.customer?.name ?? ''}. ${assignment ?? 'Sin asignar'}`}
      style={({ pressed }) => [styles.row, selected && styles.rowSelected, pressed && styles.rowPressed]}
    >
      <View style={styles.flex}>
        <View style={styles.top}>
          <Text style={[styles.customer, styles.shrink]} numberOfLines={1}>
            {s.customer?.name}
          </Text>
          {s.priority === PRIORITY.EXPRESS ? <ExpressTag /> : null}
        </View>
        <Text style={styles.meta} numberOfLines={2}>
          {meta.join(' · ')}
        </Text>
      </View>
      <View style={styles.side}>
        {/* Pendiente y asignado ya se leen en la ruta; el resto lleva su etiqueta de estado */}
        {s.status !== STATUS.PENDIENTE && s.status !== STATUS.ASIGNADO ? <StatusBadge status={s.status} /> : null}
        <RouteLabel assignment={assignment} routeCode={routeCode} routeColor={routeColor} onOpenRoute={onOpenRoute} />
      </View>
    </Pressable>
  );
}

/** Detalle del pedido elegido (panel lateral u hoja de abajo). */
export function ShipmentDetail({ shipment, assignment, routeCode, routeColor, carriedFrom, onOpenRoute }) {
  const s = shipment;
  const n = itemCount(s);
  const facts = [
    `${s.code} · ${s.scheduledTime}`,
    `${n} ${n === 1 ? 'artículo' : 'artículos'}`,
    carriedFrom ? `Desde el ${carriedFrom}` : null,
  ].filter(Boolean);
  return (
    <View style={styles.detail}>
      <View style={styles.top}>
        <Text style={[styles.detailName, styles.shrink]}>{s.customer?.name}</Text>
        {s.priority === PRIORITY.EXPRESS ? <ExpressTag /> : null}
      </View>
      <Text style={styles.detailText}>{[s.address?.text, s.address?.municipio].filter(Boolean).join(', ')}</Text>
      {facts.map((f) => (
        <Text key={f} style={styles.meta}>
          {f}
        </Text>
      ))}
      <View style={styles.detailRoute}>
        {s.status !== STATUS.PENDIENTE && s.status !== STATUS.ASIGNADO ? <StatusBadge status={s.status} /> : null}
        <RouteLabel assignment={assignment} routeCode={routeCode} routeColor={routeColor} onOpenRoute={onOpenRoute} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
    backgroundColor: colors.white,
  },
  rowSelected: { backgroundColor: colors.primaryContainer },
  rowPressed: { backgroundColor: colors.surfaceContainer },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  customer: { ...typography.bodyStrong, color: colors.onSurface },
  meta: { ...typography.caption, color: colors.onSurfaceVariant },
  muted: { color: colors.onSurfaceVariant, fontFamily: fonts.regular },
  side: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 0 },
  tag: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 1 },
  tagText: typography.captionStrong,
  route: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xs },
  routePressed: { opacity: 0.7 },
  routeTarget: { minHeight: 44, justifyContent: 'center' },
  routeText: { ...typography.bodyStrong, color: colors.onSurface },
  dot: { width: 10, height: 10, borderRadius: 5 },
  detail: { gap: spacing.xs },
  detailName: { ...typography.title, color: colors.onSurface },
  detailText: { ...typography.body, color: colors.onSurface },
  detailRoute: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});

export default ShipmentCard;
