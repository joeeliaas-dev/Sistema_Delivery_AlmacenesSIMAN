// src/components/PriorityBadge.js (dueño: P3)
// Express: rosa con rayo. Normal: borde gris. Igual que el prototipo.
import { StyleSheet, Text, View } from 'react-native';
import { PRIORITY } from '../constants';
import { colors, radius, spacing, typography } from '../theme';
import { Icon } from './Icon';

export function PriorityBadge({ priority }) {
  if (priority === PRIORITY.EXPRESS) {
    return (
      <View style={[styles.base, styles.express]}>
        <Icon name="bolt" size={16} color={colors.onTertiaryContainer} />
        <Text style={[styles.label, { color: colors.onTertiaryContainer }]}>Express</Text>
      </View>
    );
  }
  return (
    <View style={[styles.base, styles.normal]}>
      <Text style={[styles.label, { color: colors.onSurfaceVariant }]}>Normal</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 28,
    borderRadius: radius.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
  },
  express: { backgroundColor: colors.tertiaryContainer, paddingLeft: spacing.sm, paddingRight: spacing.md },
  normal: { borderWidth: 1, borderColor: colors.outlineVariant, paddingHorizontal: spacing.md },
  label: typography.captionStrong,
});

export default PriorityBadge;
