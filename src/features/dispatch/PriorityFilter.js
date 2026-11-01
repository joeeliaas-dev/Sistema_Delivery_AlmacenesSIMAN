// src/features/dispatch/PriorityFilter.js  (dueño: P2)
// Chips de filtro del prototipo (seleccionado: morado claro con ✓; resto: borde gris).
// FilterChips es genérico; PriorityFilter y ZoneFilter son sus dos usos.
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../../components/Icon';
import { PRIORITY } from '../../constants';
import { colors, radius, spacing, typography } from '../../theme';

export function FilterChips({ options, value, onChange, scroll = false }) {
  const chips = options.map(({ value: v, label }) => {
    const active = v === value;
    return (
      <Pressable
        key={String(v)}
        onPress={() => onChange(v)}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        // El chip se ve de 32 px como el prototipo, pero la zona de toque mide 44 px
        // (hitSlop no aplica en web, así que el Pressable mismo es el área de toque)
        style={styles.target}
      >
        {({ pressed }) => (
          <View style={[styles.chip, active ? styles.chipActive : styles.chipIdle, pressed && styles.chipPressed]}>
            {active ? <Icon name="check" size={18} color={colors.onSecondaryContainer} style={styles.check} /> : null}
            <Text style={[styles.label, { color: active ? colors.onSecondaryContainer : colors.onSurfaceVariant }]}>
              {label}
            </Text>
          </View>
        )}
      </Pressable>
    );
  });
  if (!scroll) return <>{chips}</>;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
      {chips}
    </ScrollView>
  );
}

const PRIORITY_OPTIONS = [
  { value: 'todos', label: 'Todos' },
  { value: PRIORITY.EXPRESS, label: 'Express' },
  { value: PRIORITY.NORMAL, label: 'Normal' },
];

export function PriorityFilter({ value, onChange }) {
  return <FilterChips options={PRIORITY_OPTIONS} value={value} onChange={onChange} />;
}

export function ZoneFilter({ zones, value, onChange }) {
  const options = [{ value: null, label: 'Todas las zonas' }, ...zones.map((z) => ({ value: z.id, label: z.name }))];
  return <FilterChips options={options} value={value} onChange={onChange} scroll />;
}

const styles = StyleSheet.create({
  target: { minHeight: 44, justifyContent: 'center' },
  chip: {
    height: 32,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipActive: { backgroundColor: colors.secondaryContainer },
  chipIdle: { borderWidth: 1, borderColor: colors.outlineVariant },
  chipPressed: { backgroundColor: colors.surfaceHigh },
  check: { marginLeft: -spacing.xs },
  label: typography.label,
  scroll: { gap: spacing.sm, paddingHorizontal: spacing.lg },
});

export default PriorityFilter;
