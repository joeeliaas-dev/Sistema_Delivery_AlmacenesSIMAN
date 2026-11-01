// src/features/driver/StartRouteCard.js (dueño: P3)
// Ruta asignada que aún no sale: resumen y botón "Iniciar ruta" (startRoute de P2).
// Ocupa el lugar de la tarjeta de Próxima parada hasta que la ruta pasa a en_curso.
import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Icon } from '../../components/Icon';
import { colors, spacing, typography } from '../../theme';
import { startRoute } from '../routes/routesService';
import { ErrorBanner } from './ErrorBanner';
import { formatClock } from './routeMath';

export function StartRouteCard({ route, driverId, firstStop }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const savingRef = useRef(false);

  const start = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await startRoute(route.id, driverId);
      // Al pasar la ruta a en_curso, el listener cambia la vista a "En ruta" sola
    } catch (err) {
      setError(err.message);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const stops = route.stops?.length ?? 0;
  return (
    <View style={styles.wrap}>
      <Card variant="primary">
        <View style={styles.header}>
          <Icon name="route" size={16} color={colors.onPrimary} />
          <Text style={styles.headerText}>{route.code} · lista para salir</Text>
        </View>
        <Text style={styles.title}>
          {stops} {stops === 1 ? 'parada' : 'paradas'}
          {route.totalKm ? ` · ${route.totalKm.toFixed(1)} km` : ''}
        </Text>
        {firstStop ? (
          <Text style={styles.body}>
            Primera parada: {firstStop.customer?.name ?? firstStop.code}
            {firstStop.address?.text ? `\n${firstStop.address.text}` : ''}
          </Text>
        ) : null}
        {route.estEnd ? <Text style={styles.caption}>Fin estimado {formatClock(route.estEnd)}</Text> : null}
        <Button
          title={saving ? 'Iniciando…' : 'Iniciar ruta'}
          icon="play_arrow"
          variant="surface"
          disabled={saving}
          onPress={start}
          style={styles.button}
        />
      </Card>
      <ErrorBanner message={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, opacity: 0.85 },
  headerText: { ...typography.caption, color: colors.onPrimary },
  title: { ...typography.headline, color: colors.onPrimary, marginTop: spacing.md },
  body: { ...typography.body, lineHeight: 22, color: colors.onPrimary, opacity: 0.85, marginTop: spacing.sm },
  caption: { ...typography.caption, color: colors.onPrimary, opacity: 0.9, marginTop: spacing.sm },
  button: { marginTop: spacing.xl },
});

export default StartRouteCard;
