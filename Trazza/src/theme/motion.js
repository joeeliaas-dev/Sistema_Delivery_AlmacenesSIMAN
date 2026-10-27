import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform } from 'react-native';
export const motion = {
  fast: 150,
  normal: 200,
  slow: 250,
  useNativeDriver: Platform.OS !== 'web',
};
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
export function useCountUp(value, { duration = motion.slow, decimals = 0 } = {}) {
  const reduce = useReduceMotion();
  const [shown, setShown] = useState(value);
  const current = useRef(value);
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
export function useEnter(index = 0) {
  const reduce = useReduceMotion();
  const [anim] = useState(() => {
    const value = new Animated.Value(reduce ? 1 : 0);
    return {
      value,
      translateY: value.interpolate({
        inputRange: [0, 1],
        outputRange: [8, 0],
      }),
    };
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
  return {
    opacity: anim.value,
    transform: [
      {
        translateY: anim.translateY,
      },
    ],
  };
}
