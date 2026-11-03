// src/features/driver/EvidenceParts.js (dueño: P3; ajuste visual: P1)
// Recuadro vacío de la evidencia (foto o firma todavía sin tomar): ícono y texto en una línea.
// Rediseño (30 oct): sin recuadro de color detrás del ícono.
// Lo que falta se ve en los pasos numerados (SectionLabel con `step`), no en chips aparte.
import { StyleSheet, Text, View } from 'react-native';
import { Icon } from '../../components/Icon';
import { colors, spacing, typography } from '../../theme';

export function EmptyEvidence({ icon, label }) {
  return (
    <View style={styles.empty} pointerEvents="none">
      <Icon name={icon} size={22} color={colors.primary} />
      <Text style={styles.emptyText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  emptyText: { ...typography.label, color: colors.primary },
});
