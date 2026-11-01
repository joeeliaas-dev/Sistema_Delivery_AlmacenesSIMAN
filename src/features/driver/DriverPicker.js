// src/features/driver/DriverPicker.js (dueño: P3)
// Herramienta de prueba: elegir qué motorista usa la vista. Solo en modo datos de prueba y sin sesión
// de motorista (con sesión, la vista es la de user.driverId).
// Rediseño (30 oct): ya no está a la vista; se abre desde "Más" en el encabezado del motorista.
// Cada botón dice solo el primer nombre ("Kevin"): la prueba de P1 lo toca por ese texto.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../theme';

export function DriverPicker({ drivers, selectedId, onSelect }) {
  return (
    <View style={styles.box}>
      <Text style={styles.caption}>Ver como (solo pruebas)</Text>
      <View style={styles.row}>
        {drivers.map((d) => {
          const selected = d.id === selectedId;
          return (
            <Pressable
              key={d.id}
              onPress={() => onSelect(d.id)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Motorista ${d.name}`}
              style={({ pressed }) => [
                styles.chip,
                selected ? styles.chipSelected : styles.chipIdle,
                pressed && !selected && styles.chipPressed,
              ]}
            >
              <Text style={[styles.name, selected && styles.nameSelected]}>{d.name.split(' ')[0]}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.white,
    gap: spacing.sm,
  },
  caption: { ...typography.caption, color: colors.onSurfaceVariant },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    justifyContent: 'center',
  },
  chipIdle: { backgroundColor: colors.white, borderColor: colors.cardBorder },
  chipSelected: { backgroundColor: colors.primaryContainer, borderColor: colors.primary },
  chipPressed: { backgroundColor: colors.surfaceContainer },
  name: { ...typography.label, color: colors.onSurface },
  nameSelected: { color: colors.onPrimaryContainer },
});

export default DriverPicker;
