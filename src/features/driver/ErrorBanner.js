// src/features/driver/ErrorBanner.js (dueño: P3)
// Muestra tal cual el mensaje del Error (ya viene en español). Con onRetry agrega "Reintentar".
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { colors, radius, spacing, typography } from '../../theme';

export function ErrorBanner({ message, onRetry }) {
  if (!message) return null;
  return (
    <View style={styles.box} accessibilityLiveRegion="polite">
      <View style={styles.row}>
        <Icon name="error_outline" size={20} color={colors.onErrorContainer} />
        <Text style={styles.text}>{message}</Text>
      </View>
      {onRetry ? (
        <Button title="Reintentar" icon="refresh" variant="text" size="sm" onPress={onRetry} style={styles.retry} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.errorContainer },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  text: { ...typography.body, color: colors.onErrorContainer, flex: 1 },
  retry: { alignSelf: 'flex-end' },
});

export default ErrorBanner;
