// src/components/Eyebrow.js (dueño: P3)
// Etiqueta de sección encima del título (V4): "TU RUTA DE HOY", "ENTREGA · SIM-0419".
import { StyleSheet, Text } from 'react-native';
import { colors, typography } from '../theme';

export function Eyebrow({ children, color = colors.primary, style }) {
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
