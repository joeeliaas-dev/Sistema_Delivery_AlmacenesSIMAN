// src/components/Eyebrow.js (dueño: P3)
// Título de sección (rediseño 30 oct: sin mayúsculas espaciadas).
import { StyleSheet, Text } from 'react-native';
import { colors, typography } from '../theme';

export function Eyebrow({ children, color = colors.onSurface, style }) {
  return (
    <Text style={[styles.text, { color }, style]} numberOfLines={1}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: typography.eyebrow,
});

export default Eyebrow;
