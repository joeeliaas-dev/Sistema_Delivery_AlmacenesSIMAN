// src/features/dispatch/PriorityFilter.js  (dueño: P2)
// Filtros del despacho (rediseño 30 oct):
//   PriorityFilter  Todos · Express · Normal en botones segmentados de 8 px (lista "Todos los pedidos")
//   ZoneSelect      "Todas las zonas ▾" encima del mapa, en vez de una fila de píldoras.
// accessibilityLabel estables para el e2e de P1: el selector es "Elegir zona" y cada opción
// "Zona: <nombre>" ("Zona: Todas las zonas" para quitar el filtro).
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PRIORITY } from '../../constants';
import { colors, radius, spacing, typography } from '../../theme';
import { Menu } from './Menu';

export function FilterChips({ options, value, onChange }) {
  return (
    <View style={styles.group}>
      {options.map(({ value: v, label }, i) => {
        const active = v === value;
        return (
          <Pressable
            key={String(v)}
            onPress={() => onChange(v)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [
              styles.segment,
              i > 0 && styles.divider,
              active && styles.active,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
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

export function ZoneSelect({ zones, value, onChange, style }) {
  const options = [{ id: null, name: 'Todas las zonas' }, ...zones];
  const current = zones.find((z) => z.id === value);
  return (
    <Menu
      label={current ? current.name : 'Todas las zonas'}
      accessibilityLabel="Elegir zona"
      style={style}
      items={options.map((z) => ({
        key: String(z.id),
        label: z.name,
        accessibilityLabel: `Zona: ${z.name}`,
        selected: z.id === (value ?? null),
        onPress: () => onChange(z.id),
      }))}
    />
  );
}

const styles = StyleSheet.create({
  group: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  segment: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.lg },
  divider: { borderLeftWidth: 1, borderLeftColor: colors.outlineVariant },
  active: { backgroundColor: colors.primaryContainer },
  pressed: { backgroundColor: colors.surfaceContainer },
  label: { ...typography.label, color: colors.onSurfaceVariant },
  labelActive: { color: colors.onPrimaryContainer },
});

export default PriorityFilter;
