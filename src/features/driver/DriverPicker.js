// src/features/driver/DriverPicker.js (dueño: P3)
// Fila de motoristas para elegir quién usa la vista (no hay login en el sprint).
// Chips blancos con borde (V1); el elegido en morado claro; al presionar, fondo y escala 98 %.
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../theme';

export function DriverPicker({ drivers, selectedId, onSelect }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.row}
    >
      {drivers.map((d) => {
        const selected = d.id === selectedId;
        return (
          <Pressable
            key={d.id}
            onPress={() => !selected && onSelect(d.id)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`Motorista ${d.name}`}
            style={({ pressed }) => [
              styles.chip,
              selected ? styles.chipSelected : styles.chipIdle,
              pressed && !selected && styles.chipPressed,
            ]}
          >
            <View style={[styles.avatar, selected && styles.avatarSelected]}>
              <Text style={[styles.initials, selected && styles.initialsSelected]}>{d.initials}</Text>
            </View>
            <Text style={[styles.name, selected && styles.nameSelected]}>{d.name.split(' ')[0]}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Sin flexGrow 0 el ScrollView horizontal ocupa todo el alto libre de la columna
  scroll: { flexGrow: 0, flexShrink: 0 },
  row: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
  chip: {
    height: 44,
    paddingLeft: spacing.xs,
    paddingRight: spacing.md,
    borderRadius: radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
  },
  chipIdle: { backgroundColor: colors.white, borderColor: colors.cardBorder },
  chipSelected: { backgroundColor: colors.primaryContainer, borderColor: colors.primary },
  chipPressed: { backgroundColor: colors.surfaceContainer, transform: [{ scale: 0.98 }] },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSelected: { backgroundColor: colors.primary },
  initials: { ...typography.captionStrong, color: colors.onSurfaceVariant },
  initialsSelected: { color: colors.onPrimary },
  name: { ...typography.label, color: colors.onSurfaceVariant },
  nameSelected: { color: colors.onPrimaryContainer },
});

export default DriverPicker;
