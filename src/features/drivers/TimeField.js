// src/features/drivers/TimeField.js (dueño: P3)
// Campo de hora "HH:MM" con etiqueta visible. En web la letra es de 16 px (Safari no hace zoom)
// y sin el contorno del navegador: el foco lo marca el borde morado.
import { useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../theme';

export function TimeField({ label, value, onChange, onBlur, invalid = false }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          onBlur?.();
        }}
        placeholder="07:00"
        placeholderTextColor={colors.placeholder}
        inputMode="numeric"
        maxLength={5}
        accessibilityLabel={label}
        style={[styles.input, focused && styles.focused, invalid && styles.invalid]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: { ...typography.caption, color: colors.onSurfaceVariant },
  input: {
    ...typography.bodyStrong,
    ...Platform.select({ web: { fontSize: 16, outlineStyle: 'none' } }),
    width: 96,
    height: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.white,
    color: colors.onSurface,
    fontVariant: ['tabular-nums'],
  },
  focused: { borderWidth: 2, borderColor: colors.primary, paddingHorizontal: spacing.md - 1 },
  invalid: { borderColor: colors.error },
});

export default TimeField;
