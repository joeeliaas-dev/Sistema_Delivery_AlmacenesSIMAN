import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../components/Button';
import { colors, elevation, spacing, typography } from '../../theme';
export function SubmitBar({ title, icon = 'check', missing, saving, onSubmit, keyboardOpen = false, children }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.bar,
        {
          paddingBottom: spacing.md + (keyboardOpen ? 0 : insets.bottom),
        },
      ]}
    >
      <Button
        title={saving ? 'Guardando…' : title}
        icon={icon}
        disabled={saving || missing.length > 0}
        onPress={onSubmit}
      />
      {missing.length > 0 && !saving ? <Text style={styles.hint}>Falta: {missing.join(', ')}</Text> : null}
      {children}
    </View>
  );
}
const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    ...elevation[2],
  },
  hint: {
    ...typography.caption,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
export default SubmitBar;
