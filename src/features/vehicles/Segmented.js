// src/features/vehicles/Segmented.js (dueño: P3)
// Dos o más opciones en una fila, una elegida ("Disponible | No trabaja hoy", "Disponible | En taller").
// Cada opción mide 44 px de alto; la elegida, blanca con borde morado; la de alerta, con su tono.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, tones, typography } from '../../theme';

/**
 * @param {{ options: Array<{ key: string, label: string, tone?: 'warning'|'error' }>, value: string,
 *   onChange: (key: string) => void, label: string, disabled?: boolean }} props
 */
export function Segmented({ options, value, onChange, label, disabled = false }) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => {
        const on = o.key === value;
        const t = o.tone ? tones[o.tone] : null;
        return (
          <Pressable
            key={o.key}
            onPress={() => !on && onChange(o.key)}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ checked: on, disabled }}
            accessibilityLabel={`${label}: ${o.label}`}
            style={({ pressed }) => [
              styles.option,
              on && styles.on,
              on && t && { backgroundColor: t.bg, borderColor: t.accent },
              pressed && !on && styles.pressed,
              disabled && styles.disabled,
            ]}
          >
            <Text style={[styles.text, on && styles.textOn, on && t && { color: t.fg }]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    padding: 2,
    gap: 2,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceHigh,
    alignSelf: 'stretch',
  },
  option: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md - 2,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  on: { backgroundColor: colors.white, borderColor: colors.primary },
  pressed: { backgroundColor: colors.surfaceContainer },
  disabled: { opacity: 0.5 },
  text: { ...typography.label, color: colors.onSurfaceVariant },
  textOn: { color: colors.onSurface },
});

export default Segmented;
