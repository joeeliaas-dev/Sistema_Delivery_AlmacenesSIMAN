// src/features/dispatch/Counters.js  (dueño: P2)
// Línea de estado del despacho (rediseño 30 oct), en vez de las tres tarjetas grandes:
//   "145 pedidos · 60 en 4 rutas · 85 sin asignar · 0 entregados"
// Números en typography.number, texto normal. En teléfono se parte en dos líneas.
// El número va ANTES de la palabra, sin nada en medio: el e2e de P1 lee "51 nuevos", "2 entregados".
import { StyleSheet, Text, View } from 'react-native';
import { colors, typography } from '../../theme';

function Part({ value, label, first }) {
  return (
    <Text style={styles.text}>
      {first ? '' : ' · '}
      <Text style={styles.number}>{value}</Text> {label}
    </Text>
  );
}

/**
 * @param {{ parts: Array<{ key: string, value: number, label: string }>, narrow?: boolean }} props
 *   narrow: dos líneas (la primera mitad arriba)
 */
export function Counters({ parts, narrow = false }) {
  const label = parts.map((p) => `${p.value} ${p.label}`).join(', ');
  const lines = narrow
    ? [parts.slice(0, Math.ceil(parts.length / 2)), parts.slice(Math.ceil(parts.length / 2))]
    : [parts];
  return (
    <View accessible accessibilityRole="summary" accessibilityLabel={label}>
      {lines.map((line, i) =>
        line.length ? (
          <Text key={i} style={styles.line}>
            {line.map((p, j) => (
              <Part key={p.key} value={p.value} label={p.label} first={j === 0} />
            ))}
          </Text>
        ) : null,
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  line: { ...typography.body, color: colors.onSurfaceVariant },
  text: { ...typography.body, color: colors.onSurfaceVariant },
  number: { ...typography.number, color: colors.onSurface },
});

export default Counters;
