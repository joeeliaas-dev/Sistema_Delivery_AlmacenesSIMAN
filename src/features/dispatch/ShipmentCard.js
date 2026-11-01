// src/features/dispatch/ShipmentCard.js  (dueño: P2)
// Tarjeta de envío del prototipo: código · hora, cliente, prioridad, dirección,
// artículos y ruta asignada o "Sin asignar". Seleccionada: fondo morado claro.
// Dirección visual: tarjeta blanca elevada (V1), barra lateral rosa si es express (V6)
// y el chip de ruta con el color de su estado (V5: sin asignar naranja, con ruta azul).
// Con onOpenRoute, el chip "Ruta X - Nombre" es tocable y abre el seguimiento de esa ruta.
// Con carriedFrom ("8 oct"), el envío viene de un día anterior y se indica junto a la hora.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '../../components/Card';
import { Icon } from '../../components/Icon';
import { PriorityBadge } from '../../components/PriorityBadge';
import { StatusBadge } from '../../components/StatusBadge';
import { PRIORITY, STATUS } from '../../constants';
import { colors, fonts, radius, spacing, statusTone, tones, typography } from '../../theme';
import { itemCount } from './dispatchMath';

export function ShipmentCard({ shipment, assignment, routeCode, carriedFrom, selected = false, onPress, onOpenRoute }) {
  // Sin ruta: tono de "pendiente"; con ruta: tono de "asignado/en ruta" (V5)
  const chipTone = statusTone(assignment ? STATUS.ASIGNADO : STATUS.PENDIENTE);
  const chipColor = chipTone.fg;
  const chipBody = (pressed) => (
    <View style={[styles.chip, { backgroundColor: chipTone.bg }, pressed && styles.chipPressed]}>
      <Icon name={assignment ? 'two_wheeler' : 'pending'} size={16} color={chipColor} />
      <Text style={[styles.chipText, { color: chipColor }]} numberOfLines={1}>
        {assignment ?? 'Sin asignar'}
      </Text>
      {onOpenRoute ? <Icon name="chevron_right" size={16} color={chipColor} /> : null}
    </View>
  );
  const s = shipment;
  const n = itemCount(s);
  const muted = selected ? colors.onPrimaryContainer : colors.onSurfaceVariant;
  const strong = selected ? colors.onPrimaryContainer : colors.onSurface;

  return (
    <Card
      variant={selected ? 'selected' : 'elevated'}
      accent={s.priority === PRIORITY.EXPRESS ? tones.tertiary.accent : undefined}
      onPress={onPress}
      style={styles.card}
    >
      <View style={styles.top}>
        <View style={styles.who}>
          <Text style={[styles.code, { color: muted, opacity: selected ? 0.7 : 1 }]}>
            {s.code} · {s.scheduledTime}
            {carriedFrom ? <Text style={styles.carried}> · Desde el {carriedFrom}</Text> : null}
          </Text>
          <Text style={[styles.customer, { color: strong }]} numberOfLines={1}>
            {s.customer?.name}
          </Text>
        </View>
        <PriorityBadge priority={s.priority} />
      </View>

      <View style={styles.address}>
        <Icon name="location_on" size={18} color={muted} style={styles.pin} />
        <Text style={[styles.addressText, { color: muted }]}>
          {[s.address?.text, s.address?.municipio].filter(Boolean).join(', ')}
        </Text>
      </View>

      <View style={styles.meta}>
        <View style={styles.metaItem}>
          <Icon name="inventory_2" size={16} color={muted} />
          <Text style={[styles.metaText, { color: muted }]}>
            {n} {n === 1 ? 'artículo' : 'artículos'}
          </Text>
        </View>
        {/* Ruta asignada como chip: morado con la moto; "Sin asignar" solo con borde.
            Si tiene ruta, el chip abre su seguimiento (zona de toque de 44 px). */}
        {onOpenRoute ? (
          <Pressable
            onPress={onOpenRoute}
            accessibilityRole="link"
            accessibilityLabel={`Ver seguimiento de la ${routeCode ?? 'ruta'}`}
            style={styles.chipTarget}
          >
            {({ pressed }) => chipBody(pressed)}
          </Pressable>
        ) : (
          chipBody(false)
        )}
        {/* Pendiente y asignado ya se leen en el chip de ruta; el resto lleva su píldora */}
        {s.status !== STATUS.PENDIENTE && s.status !== STATUS.ASIGNADO ? (
          <View style={styles.status}>
            <StatusBadge status={s.status} />
          </View>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  who: { flex: 1, minWidth: 0 },
  code: typography.code,
  carried: { fontFamily: fonts.bold, color: colors.onWarningContainer },
  customer: { ...typography.title, fontFamily: fonts.medium, marginTop: spacing.xs },
  address: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.md },
  pin: { marginTop: 1 },
  addressText: { ...typography.body, flex: 1 },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: spacing.md,
    rowGap: spacing.sm,
    marginTop: spacing.md,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  metaText: typography.caption,
  status: { marginLeft: 'auto' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    height: 28,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    flexShrink: 1,
  },
  chipTarget: { minHeight: 44, justifyContent: 'center', flexShrink: 1 },
  chipPressed: { backgroundColor: colors.primaryContainer },
  chipText: { ...typography.captionStrong, flexShrink: 1 },
});

export default ShipmentCard;
