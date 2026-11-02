// src/features/driver/RouteProgress.js (dueño: P3; ajuste visual: P1)
// Progreso de la ruta (rediseño 30 oct): una línea "Ruta A · Fin 12:20 … 2 de 8" y debajo una
// barra delgada (avanza animada en 250 ms; nada si "reducir movimiento"). Sin tarjeta.
// El nombre de la ruta se muestra tal cual viene en route.code. "Fin" llega hecho (routeTimes().end):
// la misma regla que "Llega" y que el despacho.
import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { colors, motion, radius, spacing, typography, useReduceMotion } from '../../theme';

export function RouteProgress({ routeCode, end, done, total, percent, color = colors.primary }) {
  const reduceMotion = useReduceMotion();
  const [progress] = useState(() => new Animated.Value(percent)); // se crea una sola vez

  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(percent);
      return undefined;
    }
    const anim = Animated.timing(progress, {
      toValue: percent,
      duration: motion.slow,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // anima el ancho
    });
    anim.start();
    return () => anim.stop();
  }, [percent, reduceMotion, progress]);

  const width = progress.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'], extrapolate: 'clamp' });

  return (
    <View>
      <View style={styles.row}>
        <Text style={styles.label} numberOfLines={1}>
          {routeCode}
          {end ? ` · Fin ${end}` : ''}
        </Text>
        <Text style={styles.count} accessibilityLabel={`${done} de ${total} paradas`}>
          {done} de {total}
        </Text>
      </View>
      <View
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: percent }}
      >
        <Animated.View style={[styles.fill, { width, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  label: { ...typography.body, color: colors.onSurfaceVariant, flex: 1 },
  count: { ...typography.number, fontSize: 16, color: colors.onSurface },
  track: {
    marginTop: spacing.xs,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceHigh,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radius.full },
});

export default RouteProgress;
