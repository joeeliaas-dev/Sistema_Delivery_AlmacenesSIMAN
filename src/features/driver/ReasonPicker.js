// src/features/driver/ReasonPicker.js (dueño: P3)
// Motivo de no entrega: solo la lista fija FAIL_REASONS (P1). Tarjeta blanca con borde (V1);
// el elegido en rojo claro (V5: no entregado = rojo); al presionar, fondo gris.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../../components/Icon';
import { FAIL_REASONS } from '../../constants';
import { colors, elevation, radius, spacing, tones, typography } from '../../theme';
import { SectionLabel } from './SectionLabel';

export function ReasonPicker({ value, onChange, step }) {
  return (
    <View>
      <SectionLabel step={step} done={!!value}>
        Motivo
      </SectionLabel>
      <View style={styles.list} accessibilityRole="radiogroup">
        {FAIL_REASONS.map((reason, i) => {
          const selected = reason === value;
          return (
            <Pressable
              key={reason}
              onPress={() => onChange(reason)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              style={({ pressed }) => [
                styles.row,
                i > 0 && styles.divider,
                selected && styles.rowSelected,
                pressed && !selected && styles.rowPressed,
              ]}
            >
              <Icon
                name={selected ? 'radio_button_checked' : 'radio_button_unchecked'}
                size={22}
                color={selected ? tones.error.fg : colors.onSurfaceVariant}
              />
              <Text style={[styles.text, selected && styles.textSelected]}>{reason}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.white,
    overflow: 'hidden',
    ...elevation[1],
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, minHeight: 52 },
  divider: { borderTopWidth: 1, borderTopColor: colors.cardBorder },
  rowSelected: { backgroundColor: tones.error.bg },
  rowPressed: { backgroundColor: colors.surfaceContainer },
  text: { ...typography.body, color: colors.onSurface },
  textSelected: { ...typography.bodyStrong, color: colors.onErrorContainer },
});

export default ReasonPicker;
