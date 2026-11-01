// src/components/DateSelectorParts.js (dueño: P3)
// Piezas comunes de DateSelector (teléfono) y DateSelector.web.js: cálculo de fechas
// "AAAA-MM-DD" en hora local, texto de la fecha y los chips Ayer · Hoy · Mañana.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { todayISO } from '../lib/dates';
import { colors, radius, spacing, typography } from '../theme';

const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const toDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12); // mediodía: sin saltos por cambio de horario
};

/** "2026-10-27" + 1 → "2026-10-28" */
export const addDays = (iso, n) => {
  const d = toDate(iso);
  d.setDate(d.getDate() + n);
  return todayISO(d);
};

/** "2026-10-27" → "martes 27 oct" */
export const dateLabel = (iso) => {
  const d = toDate(iso);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

export function DateChips({ value, onChange }) {
  const today = todayISO();
  const options = [
    { label: 'Ayer', date: addDays(today, -1) },
    { label: 'Hoy', date: today },
    { label: 'Mañana', date: addDays(today, 1) },
  ];
  return (
    <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Fecha">
      {options.map((o) => {
        const selected = o.date === value;
        return (
          <Pressable
            key={o.label}
            onPress={() => onChange(o.date)}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={`${o.label}, ${dateLabel(o.date)}`}
            style={styles.target}
          >
            {({ pressed }) => (
              <View
                style={[
                  styles.chip,
                  selected ? styles.chipOn : styles.chipOff,
                  pressed && !selected && styles.chipPressed,
                ]}
              >
                <Text style={[styles.chipText, selected && styles.chipTextOn]}>{o.label}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

export const dateStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  label: { ...typography.bodyStrong, color: colors.onSurface },
});

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', gap: spacing.xs },
  // El chip se ve de 36 px; el área de toque mide 44
  target: { minHeight: 44, justifyContent: 'center' },
  chip: {
    height: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipOff: { backgroundColor: colors.white, borderColor: colors.cardBorder },
  // Lo elegido en morado claro: el morado sólido es solo para la acción principal
  chipOn: { backgroundColor: colors.primaryContainer, borderColor: colors.primary },
  chipPressed: { backgroundColor: colors.surfaceContainer },
  chipText: { ...typography.label, color: colors.onSurface },
  chipTextOn: { color: colors.onPrimaryContainer },
});
