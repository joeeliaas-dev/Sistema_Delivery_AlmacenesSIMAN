// src/components/DateSelector.js (dueño: P3) — Android e iOS
// Fecha de trabajo del despacho (S4-13): chips Ayer · Hoy · Mañana y flechas de día anterior y siguiente.
// <DateSelector value onChange />; sin props usa la fecha compartida (useDateStore de P1).
// En web se usa DateSelector.web.js (con el campo de fecha del navegador).
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useDateStore } from '../store/dateStore';
import { colors, radius } from '../theme';
import { addDays, DateChips, dateLabel, dateStyles } from './DateSelectorParts';
import { Icon } from './Icon';

function Arrow({ icon, label, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.arrow, pressed && styles.arrowPressed]}
    >
      <Icon name={icon} size={24} color={colors.onSurface} />
    </Pressable>
  );
}

export function DateSelector({ value, onChange }) {
  const store = useDateStore();
  const date = value ?? store.date;
  const setDate = onChange ?? store.setDate;

  return (
    <View style={dateStyles.row}>
      <DateChips value={date} onChange={setDate} />
      <View style={styles.stepper}>
        <Arrow icon="chevron_left" label="Día anterior" onPress={() => setDate(addDays(date, -1))} />
        <Text style={dateStyles.label}>{dateLabel(date)}</Text>
        <Arrow icon="chevron_right" label="Día siguiente" onPress={() => setDate(addDays(date, 1))} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'center' },
  arrow: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  arrowPressed: { backgroundColor: colors.surfaceHigh },
});

export default DateSelector;
