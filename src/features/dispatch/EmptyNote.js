// src/features/dispatch/EmptyNote.js  (dueño: P2)
// Estado vacío en línea para listas y paneles del despacho: ícono en círculo, título y texto.
import { StyleSheet, Text, View } from 'react-native';
import { Icon } from '../../components/Icon';
import { colors, radius, spacing, typography } from '../../theme';

export function EmptyNote({ icon, title, body, style }) {
  return (
    <View style={[styles.box, style]} accessible accessibilityLabel={body ? `${title}. ${body}` : title}>
      <View style={styles.icon}>
        <Icon name={icon} size={28} color={colors.primary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceLow,
  },
  icon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  title: { ...typography.titleSmall, color: colors.onSurface, textAlign: 'center' },
  body: { ...typography.body, color: colors.onSurfaceVariant, textAlign: 'center' },
});

export default EmptyNote;
