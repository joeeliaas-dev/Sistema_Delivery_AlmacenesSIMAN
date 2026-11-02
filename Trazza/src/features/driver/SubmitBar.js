// src/features/driver/SubmitBar.js (dueño: P3; ajuste visual: P1)
// Barra inferior fija: el botón principal, bloqueado hasta tener la evidencia (y mientras guarda),
// y debajo lo que falta en una frase (N17, lo usa el e2e): "Falta la firma", "Falta la foto y la firma". Lo que falta ya se ve en los pasos 1-2-3,
// así que aquí no se repite con chips.
// En pantallas anchas el contenido queda en una columna de 640 px (rediseño 30 oct).
// Respeta el margen seguro de abajo (barra de inicio del iPhone) salvo con el teclado abierto.
// missing: ['la foto', 'la firma', …] (con su artículo, en minúsculas).
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../components/Button';
import { colors, elevation, spacing, typography } from '../../theme';
import { missingText } from './routeMath';

export function SubmitBar({ title, icon = 'check', missing, saving, onSubmit, keyboardOpen = false, children }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: spacing.md + (keyboardOpen ? 0 : insets.bottom) }]}>
      <View style={styles.column}>
        <Button
          title={saving ? 'Guardando…' : title}
          icon={icon}
          disabled={saving || missing.length > 0}
          onPress={onSubmit}
        />
        {missing.length > 0 && !saving ? <Text style={styles.hint}>{missingText(missing)}</Text> : null}
        {children}
      </View>
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
  column: { width: '100%', maxWidth: 640, alignSelf: 'center' },
  hint: { ...typography.caption, color: colors.onSurfaceVariant, textAlign: 'center', marginTop: spacing.sm },
});

export default SubmitBar;
