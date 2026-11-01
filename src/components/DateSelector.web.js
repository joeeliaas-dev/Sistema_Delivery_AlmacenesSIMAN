// src/components/DateSelector.web.js (dueño: P3) — web
// Fecha de trabajo del despacho (S4-13): chips Ayer · Hoy · Mañana y un campo de fecha del navegador.
// <DateSelector value onChange />; sin props usa la fecha compartida (useDateStore de P1).
import { View } from 'react-native';
import { useDateStore } from '../store/dateStore';
import { colors, radius, spacing } from '../theme';
import { DateChips, dateStyles } from './DateSelectorParts';

export function DateSelector({ value, onChange }) {
  const store = useDateStore();
  const date = value ?? store.date;
  const setDate = onChange ?? store.setDate;

  return (
    <View style={dateStyles.row}>
      <DateChips value={date} onChange={setDate} />
      <input
        type="date"
        value={date}
        onChange={(e) => e.target.value && setDate(e.target.value)}
        aria-label="Elegir otra fecha"
        style={{
          height: 44,
          padding: `0 ${spacing.md}px`,
          borderRadius: radius.md,
          border: `1px solid ${colors.cardBorder}`,
          background: colors.white,
          color: colors.onSurface,
          font: '500 16px Roboto_500Medium, Roboto, system-ui, sans-serif',
          cursor: 'pointer',
        }}
      />
    </View>
  );
}

export default DateSelector;
