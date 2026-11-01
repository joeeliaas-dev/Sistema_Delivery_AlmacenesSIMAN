// src/features/driver/SubmitBar.js (dueño: P3; ajuste visual: P1)
// Barra inferior fija: el botón principal, bloqueado hasta tener la evidencia (y mientras guarda),
// y debajo el texto "Falta: …" (N17, lo usa el e2e). Lo que falta ya se ve en los pasos 1-2-3,
// así que aquí no se repite con chips.
// Respeta el margen seguro de abajo (barra de inicio del iPhone) salvo con el teclado abierto.
// missing: ['firma', …] (texto en minúsculas).
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../components/Button';
import { colors, elevation, spacing, typography } from '../../theme';

export function SubmitBar({ title, icon = 'check', missing, saving, onSubmit, keyboardOpen = false, children }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: spacing.md + (keyboardOpen ? 0 : insets.bottom) }]}>
      <Button
        title={saving ? 'Guardando…' : title}
        icon={icon}
        disabled={saving || missing.length > 0}
        onPress={onSubmit}
      />
      {missing.length > 0 && !saving ? <Text style={styles.hint}>Falta: {missing.join(', ')}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    ...elevation[2],
  },
  hint: { ...typography.caption, color: colors.onSurfaceVariant, textAlign: 'center', marginTop: spacing.sm },
});

export default SubmitBar;
