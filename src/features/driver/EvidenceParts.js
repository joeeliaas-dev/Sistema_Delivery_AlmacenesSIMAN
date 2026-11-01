// src/features/driver/EvidenceParts.js (dueño: P3; ajuste visual: P1)
// Recuadro vacío de la evidencia (foto o firma todavía sin tomar): ícono y texto centrados.
// Lo que falta se ve en los pasos numerados (SectionLabel con `step`), no en chips aparte.
import { StyleSheet, Text, View } from 'react-native';
import { IconTile } from '../../components/IconTile';
import { colors, spacing, typography } from '../../theme';

export function EmptyEvidence({ icon, label }) {
  return (
    <View style={styles.empty} pointerEvents="none">
      <IconTile icon={icon} tone="primary" size={48} />
      <Text style={styles.emptyText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  emptyText: { ...typography.label, color: colors.primary },
});
