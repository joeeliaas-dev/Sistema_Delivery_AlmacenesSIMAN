// src/features/driver/StopList.js (dueño: P3)
// "Paradas restantes" plegable, como línea de tiempo: un círculo por parada con el color de su
// estado (V5) unido por una línea (las restantes, con el color de la ruta si llega: el mismo de
// los pines del despacho); a la derecha la hora de llegada (N24; rediseño: "10:56", no "~14 min").
// Abajo las completadas, tachadas. N13: cada parada restante se puede tocar para atenderla
// fuera de orden (abre su Confirmar entrega). Las filas entran con un desplazamiento corto (V8).
import { useState } from 'react';
import { Animated, LayoutAnimation, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '../../components/Card';
import { Icon } from '../../components/Icon';
import { STATUS } from '../../constants';
import { colors, motion, spacing, statusTone, tones, typography, useEnter, useReduceMotion } from '../../theme';

// Parada que pasó a otra ruta (reintento): cuenta como cerrada en esta (N4)
const MOVED = { ...tones.neutral, icon: 'redo', label: 'Reprogramado en otra ruta' };
const CLOSED_LABEL = {
  [STATUS.ENTREGADO]: 'Entregado',
  [STATUS.NO_ENTREGADO]: 'No entregado',
  [STATUS.DEVUELTO]: 'Vuelve a bodega',
};

function Rail({ first, last }) {
  return (
    <View style={styles.rail} pointerEvents="none">
      {!first ? <View style={[styles.line, styles.lineTop]} /> : null}
      {!last ? <View style={[styles.line, styles.lineBottom]} /> : null}
    </View>
  );
}

function OpenRow({ stop, time, index, first, last, onPress, color }) {
  const enter = useEnter(index);
  const tone = statusTone(stop.shipment.status);
  return (
    <Animated.View style={enter}>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={`Atender parada ${stop.seq}, ${stop.shipment.customer?.name ?? stop.shipment.code}`}
        accessibilityHint="Abre Confirmar entrega fuera de orden"
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        <View style={styles.lead}>
          <Rail first={first} last={last} />
          <View style={[styles.dot, { borderColor: color ?? tone.accent, backgroundColor: colors.white }]}>
            <Text style={[styles.seq, { color: color ? colors.onSurface : tone.fg }]}>{stop.seq}</Text>
          </View>
        </View>
        <View style={styles.rowText}>
          <Text style={styles.title} numberOfLines={1}>
            {stop.shipment.customer?.name ?? stop.shipment.code}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {stop.shipment.address?.text ?? stop.shipment.code}
          </Text>
        </View>
        <Text style={styles.eta}>{time}</Text>
        {onPress ? <Icon name="chevron_right" size={20} color={colors.onSurfaceVariant} /> : null}
      </Pressable>
    </Animated.View>
  );
}

function ClosedRow({ stop, first, last }) {
  const t = stop.moved ? MOVED : statusTone(stop.shipment.status);
  const label = stop.moved ? MOVED.label : CLOSED_LABEL[stop.shipment.status];
  const icon = stop.moved ? MOVED.icon : stop.shipment.status === STATUS.ENTREGADO ? 'check' : t.icon;
  return (
    <View style={styles.row}>
      <View style={styles.lead}>
        <Rail first={first} last={last} />
        <View style={[styles.dot, { borderColor: t.bg, backgroundColor: t.bg }]}>
          <Icon name={icon} size={18} color={t.fg} />
        </View>
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.title, styles.done]} numberOfLines={1}>
          {stop.shipment?.customer?.name ?? stop.shipmentId}
        </Text>
        <Text style={[styles.subtitle, { color: t.fg }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </View>
  );
}

// title: "Paradas restantes" en ruta; "Paradas de la ruta" antes de salir. Sin onStopPress, las filas
// no se pueden tocar (la ruta aún no sale) y no llevan chevron.
// times: { [shipmentId]: 'HH:MM' } de routeTimes (P1): planeadas sin salir, en vivo ya en camino
export function StopList({ remaining, completed, times = {}, onStopPress, color, title = 'Paradas restantes' }) {
  const [open, setOpen] = useState(true);
  const reduceMotion = useReduceMotion();
  const rows = remaining.length + completed.length;

  const toggle = () => {
    if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.create(motion.normal, 'easeInEaseOut', 'opacity'));
    setOpen(!open);
  };

  return (
    <Card variant="elevated" padded={false}>
      <Pressable
        onPress={toggle}
        style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Text style={styles.toggleLabel}>{title}</Text>
        <Text style={styles.countLabel}>{remaining.length}</Text>
        <Icon
          name="expand_more"
          size={24}
          color={colors.onSurfaceVariant}
          style={[styles.chevron, open && styles.chevronOpen]}
        />
      </Pressable>

      {open && rows ? (
        <View style={styles.list}>
          {remaining.map((stop, i) => (
            <OpenRow
              key={stop.shipmentId}
              stop={stop}
              time={times[stop.shipmentId]}
              color={color}
              index={i}
              first={i === 0}
              last={i === rows - 1}
              onPress={onStopPress ? () => onStopPress(stop.shipmentId) : undefined}
            />
          ))}
          {completed.length ? <Text style={styles.section}>Completadas · {completed.length}</Text> : null}
          {completed.map((stop, i) => (
            <ClosedRow
              key={stop.shipmentId}
              stop={stop}
              first={remaining.length + i === 0}
              last={remaining.length + i === rows - 1}
            />
          ))}
        </View>
      ) : null}
    </Card>
  );
}

const DOT = 32;

const styles = StyleSheet.create({
  toggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, height: 56 },
  toggleLabel: { ...typography.titleSmall, color: colors.onSurface },
  countLabel: { ...typography.number, color: colors.onSurfaceVariant },
  chevron: { marginLeft: 'auto' },
  chevronOpen: { transform: [{ rotate: '180deg' }] },
  list: { borderTopWidth: 1, borderTopColor: colors.cardBorder, paddingVertical: spacing.sm },
  section: {
    ...typography.captionStrong,
    color: colors.onSurfaceVariant,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingLeft: spacing.lg,
    paddingRight: spacing.md,
    minHeight: 64,
  },
  pressed: { backgroundColor: colors.surfaceContainer },
  // Columna del círculo y la línea de tiempo
  lead: { width: DOT, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  rail: { ...StyleSheet.absoluteFillObject, alignItems: 'center' },
  line: { position: 'absolute', width: 2, backgroundColor: colors.cardBorder },
  lineTop: { top: 0, height: '50%' },
  lineBottom: { bottom: 0, height: '50%' },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seq: { ...typography.captionStrong, fontFamily: typography.fonts.bold },
  rowText: { flex: 1, minWidth: 0, paddingVertical: spacing.md },
  title: { ...typography.bodyStrong, color: colors.onSurface },
  // Completadas: tachadas en gris variante (contraste 6.8:1)
  done: { textDecorationLine: 'line-through', color: colors.onSurfaceVariant },
  subtitle: { ...typography.caption, color: colors.onSurfaceVariant, marginTop: 2 },
  eta: { ...typography.number, color: colors.onSurface },
});

export default StopList;
