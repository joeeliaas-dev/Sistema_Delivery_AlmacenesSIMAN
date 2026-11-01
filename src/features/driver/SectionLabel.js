// src/features/driver/SectionLabel.js (dueño: P3; ajuste visual: P1)
// Título de cada bloque de evidencia ("Foto de evidencia", "Firma del cliente"…), con acción
// opcional a la derecha. Con `step`, el formulario se lee como pasos 1-2-3: el número va en un
// círculo morado y, cuando el paso está listo (`done`), pasa a una palomita verde.
import { StyleSheet, Text, View } from 'react-native';
import { Icon } from '../../components/Icon';
import { colors, spacing, typography } from '../../theme';

export function SectionLabel({ children, right, step, done = false }) {
  return (
    <View style={styles.row}>
      {step ? (
        <View
          style={[styles.step, done ? styles.stepDone : styles.stepTodo]}
          accessibilityLabel={done ? `Paso ${step} listo` : `Paso ${step}`}
        >
          {done ? <Icon name="check" size={16} color={colors.white} /> : <Text style={styles.stepText}>{step}</Text>}
        </View>
      ) : null}
      <Text style={styles.label}>{children}</Text>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const STEP = 24;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 32,
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.sm,
  },
  step: { width: STEP, height: STEP, borderRadius: STEP / 2, alignItems: 'center', justifyContent: 'center' },
  stepTodo: { backgroundColor: colors.primaryContainer },
  stepDone: { backgroundColor: colors.success },
  stepText: { ...typography.captionStrong, fontFamily: typography.fonts.bold, color: colors.onPrimaryContainer },
  label: { ...typography.bodyStrong, color: colors.onSurface, flex: 1 },
  right: { marginLeft: 'auto' },
});

export default SectionLabel;
