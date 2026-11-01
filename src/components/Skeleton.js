// src/components/Skeleton.js (dueño: P3)
// Bloque gris del tamaño del contenido que todavía no llega. Fijo, sin parpadeo en bucle (N19).
import { StyleSheet, View } from 'react-native';
import { colors, radius } from '../theme';

export function Skeleton({ width = '100%', height = 16, round = false, tone = 'base', style }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.base,
        { width, height, borderRadius: round ? height / 2 : radius.sm },
        tone === 'strong' && styles.strong,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: colors.surfaceHigh },
  strong: { backgroundColor: colors.outlineVariant },
});

export default Skeleton;
