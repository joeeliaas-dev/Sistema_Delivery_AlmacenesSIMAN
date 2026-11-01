// src/features/driver/ScreenHeader.js (dueño: P3)
// Encabezado de Confirmar entrega y No entregado: volver, título y "SIM-0419 · Cliente"
// en texto normal (N30: sin etiquetas en mayúsculas).
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../../components/Icon';
import { colors, spacing, typography } from '../../theme';

export function ScreenHeader({ title, shipment, onBack }) {
  return (
    <View style={styles.header}>
      <Pressable
        onPress={onBack}
        style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
        accessibilityRole="button"
        accessibilityLabel="Volver"
      >
        <Icon name="arrow_back" size={24} color={colors.onSurface} />
      </Pressable>
      <View style={styles.text}>
        <Text style={styles.title}>{title}</Text>
        {shipment ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {shipment.code}
            {shipment.customer?.name ? ` · ${shipment.customer.name}` : ''}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    minHeight: 64,
  },
  back: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  backPressed: { backgroundColor: colors.surfaceHigh },
  text: { flex: 1, minWidth: 0 },
  title: {
    ...typography.title,
    fontFamily: typography.fonts.bold,
    fontSize: 20,
    lineHeight: 26,
    color: colors.onSurface,
  },
  subtitle: { ...typography.body, color: colors.onSurfaceVariant },
});

export default ScreenHeader;
