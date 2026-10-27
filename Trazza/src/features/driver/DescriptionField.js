import { useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { MIN_DESCRIPTION_LENGTH } from '../../constants';
import { colors, radius, spacing, typography } from '../../theme';
import { SectionLabel } from './SectionLabel';
export const isDescriptionValid = (text) => (text ?? '').trim().length >= MIN_DESCRIPTION_LENGTH;
export function DescriptionField({ value, onChange, onFocus, label = 'Descripción (obligatoria)', placeholder, step }) {
  const [focused, setFocused] = useState(false);
  const length = (value ?? '').trim().length;
  const missing = MIN_DESCRIPTION_LENGTH - length;
  return (
    <View>
      <SectionLabel step={step} done={missing <= 0}>
        {label}
      </SectionLabel>
      <View style={[styles.box, focused && styles.boxFocused]}>
        <TextInput
          value={value}
          onChangeText={onChange}
          onFocus={() => {
            setFocused(true);
            onFocus?.();
          }}
          onBlur={() => setFocused(false)}
          multiline
          placeholder={placeholder}
          placeholderTextColor={colors.placeholder}
          style={styles.input}
          textAlignVertical="top"
          accessibilityLabel={label}
        />
      </View>
      <View style={styles.helpRow}>
        <Text style={[styles.help, missing <= 0 && styles.helpOk]}>
          {missing > 0 ? `Mínimo ${MIN_DESCRIPTION_LENGTH} caracteres · faltan ${missing}` : `${length} caracteres`}
        </Text>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  boxFocused: {
    borderWidth: 2,
    borderColor: colors.primary,
    paddingHorizontal: spacing.lg - 1,
    paddingVertical: spacing.md - 1,
  },
  input: {
    ...typography.body,
    ...Platform.select({
      web: {
        fontSize: 16,
        lineHeight: 22,
        outlineStyle: 'none',
      },
    }),
    color: colors.onSurface,
    minHeight: 72,
    padding: 0,
  },
  helpRow: {
    flexDirection: 'row',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  help: {
    ...typography.caption,
    color: colors.onSurfaceVariant,
  },
  helpOk: {
    color: colors.onSuccessContainer,
    fontFamily: typography.fonts.medium,
  },
});
export default DescriptionField;
