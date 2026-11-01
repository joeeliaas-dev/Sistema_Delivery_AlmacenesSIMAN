// src/features/driver/RouteProgress.js (dueño: P3; ajuste visual: P1)
// Progreso de la ruta, sin repetir el mismo dato: el número grande "2 de 8 paradas", la barra
// (avanza animada en 250 ms; nada si "reducir movimiento") y una línea con lo que falta y el
// fin estimado. El nombre de la ruta se muestra tal cual viene en route.code.
import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Card } from '../../components/Card';
import { Icon } from '../../components/Icon';
import { colors, gradients, motion, radius, spacing, typography, useReduceMotion } from '../../theme';
import { formatClock } from './routeMath';

export function RouteProgress({ routeCode, done, total, percent, estEnd }) {
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
  const left = total - done;

  return (
    <Card variant="elevated">
      <Text style={styles.label}>Progreso de {routeCode}</Text>
      <Text style={styles.big} accessibilityLabel={`${done} de ${total} paradas`}>
        {done} de {total}
        <Text style={styles.bigUnit}> paradas</Text>
      </Text>
      <View
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: percent }}
      >
        <Animated.View style={[styles.fill, gradients.primaryBar, { width }]} />
      </View>
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {left === 0 ? 'Sin paradas pendientes' : `${left} ${left === 1 ? 'parada restante' : 'paradas restantes'}`}
        </Text>
        {estEnd ? (
          <View style={styles.end}>
            <Icon name="schedule" size={16} color={colors.onSurfaceVariant} />
            <Text style={styles.footerText}>Fin {formatClock(estEnd)}</Text>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  label: { ...typography.body, color: colors.onSurfaceVariant },
  big: { ...typography.display, color: colors.onSurface, marginTop: spacing.xs, fontVariant: ['tabular-nums'] },
  bigUnit: { ...typography.body, fontSize: 16, color: colors.onSurfaceVariant, letterSpacing: 0 },
  track: {
    marginTop: spacing.md,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.primaryContainer,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radius.full },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md },
  end: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  footerText: { ...typography.body, color: colors.onSurfaceVariant },
});

export default RouteProgress;
