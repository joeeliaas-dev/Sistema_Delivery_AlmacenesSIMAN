// src/components/RouteMapParts.js  (dueño: P2)
// Piezas comunes de RouteMap.js (nativo), RouteMap.web.js y el seguimiento de ruta:
// colores de pin por estado (V5, statusTone de P3), leyenda y StopPin
// (número con el rayo de express en la esquina).
import { StyleSheet, Text, View } from 'react-native';
import { PRIORITY, STATUS } from '../constants';
import { colors, fonts, radius, spacing, statusTone, tones, typography } from '../theme';
import { Icon } from './Icon';

/** Colores del pin: los del estado del envío (V5), iguales en pines, píldoras y contadores. */
export function pinStyle(stop) {
  const t = statusTone(stop.status ?? STATUS.PENDIENTE);
  return { bg: t.bg, border: t.accent, fg: t.fg };
}

/** Pin de parada: número o código en círculo del color de su estado; si es express, rayo rosa. */
export function StopPin({ label, priority, status, size = 32 }) {
  const p = pinStyle({ status });
  const express = priority === PRIORITY.EXPRESS;
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={[
          styles.pin,
          { minWidth: size, height: size, borderRadius: size / 2, backgroundColor: p.bg, borderColor: p.border },
        ]}
      >
        <Text style={[styles.pinText, { color: p.fg }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
      {express ? (
        <View style={styles.bolt} accessibilityLabel="Express">
          <Icon name="bolt" size={12} color={tones.tertiary.fg} />
        </View>
      ) : null}
    </View>
  );
}

const LEGEND = [
  { key: 'depot', label: 'Depósito SIMAN' },
  { key: STATUS.PENDIENTE, label: 'Pendiente' },
  { key: STATUS.EN_RUTA, label: 'Asignado o en ruta' },
  { key: STATUS.ENTREGADO, label: 'Entregado' },
  { key: STATUS.NO_ENTREGADO, label: 'No entregado' },
  { key: 'express', label: 'Express' },
];

export function MapLegend({ style }) {
  return (
    <View style={[styles.legend, style]} pointerEvents="none">
      {LEGEND.map(({ key, label }) => {
        let dot;
        if (key === 'depot') dot = <View style={[styles.dot, styles.depot]} />;
        else if (key === 'express')
          dot = (
            <View style={[styles.dot, styles.express]}>
              <Icon name="bolt" size={10} color={tones.tertiary.fg} />
            </View>
          );
        else {
          const t = statusTone(key);
          dot = <View style={[styles.dot, { backgroundColor: t.bg, borderColor: t.accent, borderWidth: 2 }]} />;
        }
        return (
          <View key={key} style={styles.row}>
            {dot}
            <Text style={styles.text}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  pin: { paddingHorizontal: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  pinText: { fontSize: 12, lineHeight: 16, fontFamily: fonts.bold },
  bolt: {
    position: 'absolute',
    top: -4,
    right: -6,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.white,
    backgroundColor: tones.tertiary.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Dos columnas: a 360 px la leyenda ocupa 3 renglones en vez de 6
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, width: '50%', paddingRight: spacing.xs },
  dot: { width: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  depot: { backgroundColor: colors.primary },
  express: { backgroundColor: tones.tertiary.bg, borderWidth: 1, borderColor: tones.tertiary.accent },
  text: { ...typography.caption, color: colors.onSurfaceVariant, flexShrink: 1 },
});
