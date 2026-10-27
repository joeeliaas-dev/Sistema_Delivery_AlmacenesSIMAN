import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '../../components/Card';
import { Icon } from '../../components/Icon';
import { PriorityBadge } from '../../components/PriorityBadge';
import { StatusBadge } from '../../components/StatusBadge';
import { PRIORITY, STATUS } from '../../constants';
import { colors, fonts, radius, spacing, statusTone, tones, typography } from '../../theme';
import { itemCount } from './dispatchMath';
export function ShipmentCard({ shipment, assignment, routeCode, carriedFrom, selected = false, onPress, onOpenRoute }) {
  const chipTone = statusTone(assignment ? STATUS.ASIGNADO : STATUS.PENDIENTE);
  const chipColor = chipTone.fg;
  const chipBody = (pressed) => (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: chipTone.bg,
        },
        pressed && styles.chipPressed,
      ]}
    >
      <Icon name={assignment ? 'two_wheeler' : 'pending'} size={16} color={chipColor} />
      <Text
        style={[
          styles.chipText,
          {
            color: chipColor,
          },
        ]}
        numberOfLines={1}
      >
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
          <Text
            style={[
              styles.code,
              {
                color: muted,
                opacity: selected ? 0.7 : 1,
              },
            ]}
          >
            {s.code} · {s.scheduledTime}
            {carriedFrom ? <Text style={styles.carried}> · Desde el {carriedFrom}</Text> : null}
          </Text>
          <Text
            style={[
              styles.customer,
              {
                color: strong,
              },
            ]}
            numberOfLines={1}
          >
            {s.customer?.name}
          </Text>
        </View>
        <PriorityBadge priority={s.priority} />
      </View>

      <View style={styles.address}>
        <Icon name="location_on" size={18} color={muted} style={styles.pin} />
        <Text
          style={[
            styles.addressText,
            {
              color: muted,
            },
          ]}
        >
          {[s.address?.text, s.address?.municipio].filter(Boolean).join(', ')}
        </Text>
      </View>

      <View style={styles.meta}>
        <View style={styles.metaItem}>
          <Icon name="inventory_2" size={16} color={muted} />
          <Text
            style={[
              styles.metaText,
              {
                color: muted,
              },
            ]}
          >
            {n} {n === 1 ? 'artículo' : 'artículos'}
          </Text>
        </View>
        {}
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
        {}
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
  card: {
    borderRadius: radius.lg,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  who: {
    flex: 1,
    minWidth: 0,
  },
  code: typography.code,
  carried: {
    fontFamily: fonts.bold,
    color: colors.onWarningContainer,
  },
  customer: {
    ...typography.title,
    fontFamily: fonts.medium,
    marginTop: spacing.xs,
  },
  address: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  pin: {
    marginTop: 1,
  },
  addressText: {
    ...typography.body,
    flex: 1,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: spacing.md,
    rowGap: spacing.sm,
    marginTop: spacing.md,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  metaText: typography.caption,
  status: {
    marginLeft: 'auto',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    height: 28,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    flexShrink: 1,
  },
  chipTarget: {
    minHeight: 44,
    justifyContent: 'center',
    flexShrink: 1,
  },
  chipPressed: {
    backgroundColor: colors.primaryContainer,
  },
  chipText: {
    ...typography.captionStrong,
    flexShrink: 1,
  },
});
export default ShipmentCard;
