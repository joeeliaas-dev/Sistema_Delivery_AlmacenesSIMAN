// src/theme/motion.js (dueño: P3)
// Animaciones (N19): solo Animated / LayoutAnimation, cortas, y nada si el teléfono
// tiene activado "reducir movimiento".
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform } from 'react-native';

export const motion = {
  fast: 150,
  normal: 200,
  slow: 250,
  // El driver nativo no existe en web; ahí Animated corre en JS
  useNativeDriver: Platform.OS !== 'web',
};

// Último valor conocido, para que una animación no arranque antes de saber la respuesta:
// en web se lee al instante; en el teléfono se consulta al cargar la app y se mantiene al día.
const webQuery =
  Platform.OS === 'web' && typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;
let lastKnown = webQuery ? webQuery.matches : false;
if (!webQuery) {
  AccessibilityInfo.isReduceMotionEnabled()
    .then((value) => {
      lastKnown = value;
    })
    .catch(() => {});
}

/** true si el usuario pidió reducir movimiento (se actualiza si lo cambia). */
export function useReduceMotion() {
  const [reduce, setReduce] = useState(() => (webQuery ? webQuery.matches : lastKnown));
  useEffect(() => {
    let active = true;
    const update = (value) => {
      lastKnown = value;
      if (active) setReduce(value);
    };
    AccessibilityInfo.isReduceMotionEnabled()
      .then(update)
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', update);
    return () => {
      active = false;
      sub?.remove?.();
    };
  }, []);
  return reduce;
}

/**
 * Número que cambia con un conteo corto (V8): al pasar de 2 a 3 cuenta 2 → 3 en 250 ms.
 * Al montar muestra el valor final (no cuenta desde 0). Sin animación si "reducir movimiento".
 * Si value no es número, lo devuelve tal cual.
 * @param {number} value
 * @param {{ duration?: number, decimals?: number }} [options]
 * @returns {number}
 */
export function useCountUp(value, { duration = motion.slow, decimals = 0 } = {}) {
  const reduce = useReduceMotion();
  const [shown, setShown] = useState(value);
  const current = useRef(value); // lo que se ve ahora (para seguir desde ahí si cambia a medio conteo)

  useEffect(() => {
    const target = Number(value);
    const start = Number(current.current);
    if (reduce || !Number.isFinite(target) || !Number.isFinite(start) || start === target) {
      current.current = value;
      return undefined;
    }
    const factor = 10 ** decimals;
    const t0 = Date.now();
    let frame = requestAnimationFrame(function tick() {
      const p = Math.min(1, (Date.now() - t0) / duration);
      const eased = 1 - (1 - p) ** 3;
      const next = Math.round((start + (target - start) * eased) * factor) / factor;
      current.current = next;
      setShown(next);
      if (p < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [value, reduce, duration, decimals]);

  if (reduce || typeof value !== 'number') return value;
  return shown;
}

/**
 * Entrada de un elemento de lista (V8): sube 8 px y aparece en 200 ms; `index` escalona
 * las primeras filas (máx. 5 × 30 ms). Devuelve un estilo para Animated.View.
 * Sin animación si "reducir movimiento".
 */
export function useEnter(index = 0) {
  const reduce = useReduceMotion();
  const [anim] = useState(() => {
    const value = new Animated.Value(reduce ? 1 : 0);
    return { value, translateY: value.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) };
  });
  useEffect(() => {
    if (reduce) {
      anim.value.setValue(1);
      return undefined;
    }
    const a = Animated.timing(anim.value, {
      toValue: 1,
      duration: motion.normal,
      delay: Math.min(index, 5) * 30,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: motion.useNativeDriver,
    });
    a.start();
    return () => a.stop();
  }, [anim, index, reduce]);
  return { opacity: anim.value, transform: [{ translateY: anim.translateY }] };
}
