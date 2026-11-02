// src/features/importer/ImportSteps.js (dueño: P3)
// Indicador de pasos 1 Subir · 2 Revisar · 3 Confirmar: el actual en morado, los hechos en verde
// con palomita, los que siguen en gris. Mismo criterio que los pasos de Confirmar entrega.
import { StyleSheet, Text, View } from 'react-native';
import { Icon } from '../../components/Icon';
import { colors, radius, spacing, tones, typography } from '../../theme';

export const IMPORT_STEPS = ['Subir', 'Revisar', 'Confirmar'];

export function ImportSteps({ current }) {
  return (
    <View
      style={styles.row}
      accessibilityRole="progressbar"
      accessibilityLabel={current > IMPORT_STEPS.length ? 'Carga terminada' : `Paso ${current} de 3`}
    >
      {IMPORT_STEPS.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <View key={label} style={styles.item}>
            {i > 0 ? <View style={[styles.line, (done || active) && styles.lineOn]} /> : null}
            <View style={[styles.dot, done && styles.dotDone, active && styles.dotActive]}>
              {done ? (
                <Icon name="check" size={16} color={colors.white} />
              ) : (
                <Text style={[styles.num, active && styles.numActive]}>{n}</Text>
              )}
            </View>
            <Text style={[styles.label, active && styles.labelActive, done && styles.labelDone]}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const DOT = 28;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', rowGap: spacing.sm },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  // Líneas cortas: los tres pasos caben en un renglón desde 360 px
  line: { width: 16, height: 2, borderRadius: 1, backgroundColor: colors.cardBorder, marginHorizontal: spacing.xs },
  lineOn: { backgroundColor: tones.success.accent },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.cardBorder,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  dotDone: { borderColor: tones.success.accent, backgroundColor: tones.success.accent },
  num: { ...typography.captionStrong, fontFamily: typography.fonts.bold, color: colors.onSurfaceVariant },
  numActive: { color: colors.onPrimary },
  label: { ...typography.label, color: colors.onSurfaceVariant },
  labelActive: { color: colors.onSurface, fontFamily: typography.fonts.bold },
  labelDone: { color: tones.success.fg },
});

export default ImportSteps;
