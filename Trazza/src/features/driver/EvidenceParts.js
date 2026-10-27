import { StyleSheet, Text, View } from 'react-native';
import { IconTile } from '../../components/IconTile';
import { colors, spacing, typography } from '../../theme';
export function EmptyEvidence({ icon, label }) {
  return (
    <View style={styles.empty} pointerEvents="none">
      <IconTile icon={icon} tone="primary" size={48} />
      <Text style={styles.emptyText}>{label}</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  emptyText: {
    ...typography.label,
    color: colors.primary,
  },
});
