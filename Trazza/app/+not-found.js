// app/+not-found.js  (dueño: P1)
// Se ve mientras una vista de la barra todavía no existe (p. ej. el día 1).
import { usePathname } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../src/theme';

export default function NotFound() {
  const pathname = usePathname();
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Vista en construcción</Text>
      <Text style={styles.body}>{pathname} todavía no tiene pantalla.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
  title: { ...typography.title, color: colors.onSurface, marginBottom: spacing.sm },
  body: { ...typography.body, color: colors.onSurfaceVariant, textAlign: 'center' },
});
