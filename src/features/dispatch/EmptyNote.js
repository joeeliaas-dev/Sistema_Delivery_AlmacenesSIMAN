// src/features/dispatch/EmptyNote.js  (dueño: P2)
// Estado vacío en línea para listas y paneles del despacho (rediseño 30 oct): título y, si hace
// falta, una línea gris. Sin ícono en círculo; `icon` se acepta pero ya no se dibuja.
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../theme';

export function EmptyNote({ title, body, style }) {
  return (
    <View style={[styles.box, style]} accessible accessibilityLabel={body ? `${title}. ${body}` : title}>
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceLow,
  },
  title: { ...typography.bodyStrong, color: colors.onSurface, textAlign: 'center' },
  body: { ...typography.body, color: colors.onSurfaceVariant, textAlign: 'center' },
});

export default EmptyNote;
