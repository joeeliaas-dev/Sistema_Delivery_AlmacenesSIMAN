// src/features/driver/EmptyState.js (dueño: P3; ajuste visual: P1)
// Aviso centrado: sin ruta hoy, ruta terminada, sin parada pendiente y pantallas de resultado.
// Ícono en un círculo de color suave (verde si es un éxito, ámbar para reintento, gris para
// devuelto, morado en lo demás). Con `large` (resultado de una entrega) ocupa la pantalla, queda
// centrado y el ícono entra con escala y opacidad en 220 ms (N19).
import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../../components/Icon';
import { colors, motion, spacing, tones, typography, useReduceMotion } from '../../theme';

const ENTER_MS = 220;

export function EmptyState({ icon, title, body, tone = 'primary', large = false, children }) {
  const t = tones[tone] ?? tones.primary;
  const reduceMotion = useReduceMotion();
  // Se crea una sola vez; con "reducir movimiento" nace ya visible (sin un cuadro invisible)
  const [enter] = useState(() => new Animated.Value(large && !reduceMotion ? 0 : 1));

  useEffect(() => {
    if (!large) return undefined;
    if (reduceMotion) {
      enter.setValue(1);
      return undefined;
    }
    const anim = Animated.timing(enter, {
      toValue: 1,
      duration: ENTER_MS,
      easing: Easing.out(Easing.back(1.4)),
      useNativeDriver: motion.useNativeDriver,
    });
    anim.start();
    return () => anim.stop();
  }, [large, reduceMotion, enter]);

  const scale = enter.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] });
  const opacity = enter.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 1, 1] });
  const size = large ? 96 : 72;

  return (
    <View style={[styles.box, large && styles.boxLarge]}>
      <Animated.View
        style={[
          styles.badge,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: t.bg },
          { opacity, transform: [{ scale }] },
        ]}
      >
        <Icon name={icon} size={large ? 48 : 36} color={t.accent} />
      </Animated.View>
      <View style={styles.text}>
        <Text style={[styles.title, large && styles.titleLarge]} accessibilityRole="header">
          {title}
        </Text>
        {body ? <Text style={styles.body}>{body}</Text> : null}
      </View>
      {children ? <View style={styles.actions}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', paddingHorizontal: spacing.xxl, paddingVertical: spacing.xxxl, gap: spacing.xl },
  // Resultado de una entrega: ocupa la pantalla y queda centrado (no pegado arriba)
  boxLarge: { flex: 1, justifyContent: 'center', paddingBottom: spacing.xxxl * 2 },
  badge: { alignItems: 'center', justifyContent: 'center' },
  text: { alignItems: 'center', gap: spacing.sm, maxWidth: 360 },
  title: { ...typography.title, fontFamily: typography.fonts.bold, color: colors.onSurface, textAlign: 'center' },
  titleLarge: { fontSize: 24, lineHeight: 30 },
  body: { ...typography.body, lineHeight: 22, color: colors.onSurfaceVariant, textAlign: 'center' },
  actions: { alignSelf: 'stretch', alignItems: 'center', gap: spacing.md },
});

export default EmptyState;
