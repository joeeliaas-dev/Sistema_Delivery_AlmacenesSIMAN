// src/features/driver/StartRouteCard.js (dueño: P3)
// Ruta asignada que aún no sale: resumen y botón "Iniciar ruta" (startRoute de P2).
// Ocupa el lugar de la tarjeta de Próxima parada hasta que la ruta pasa a en_curso.
// Rediseño (30 oct): blanca con borde del color de la ruta; "Iniciar ruta" es la acción principal.
// "Fin" llega hecho (routeTimes().end), igual que en el despacho.
import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { colors, radius, spacing, typography } from '../../theme';
import { startRoute } from '../routes/routesService';
import { ErrorBanner } from './ErrorBanner';

export function StartRouteCard({ route, driverId, firstStop, end, color = colors.primary }) {
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
  const facts = [
    `${stops} ${stops === 1 ? 'parada' : 'paradas'}`,
    route.totalKm ? `${route.totalKm.toFixed(1)} km` : null,
    end ? `Fin ${end}` : null,
  ].filter(Boolean);
  return (
    <View style={styles.wrap}>
      <View style={[styles.card, { borderColor: color }]}>
        <Text style={styles.kicker}>Lista para salir</Text>
        <Text style={styles.title} accessibilityRole="header">
          {route.code}
        </Text>
        <Text style={styles.facts}>{facts.join(' · ')}</Text>
        {firstStop ? (
          <View style={styles.first}>
            <Text style={styles.firstLabel}>Primera parada</Text>
            <Text style={styles.firstName}>{firstStop.customer?.name ?? firstStop.code}</Text>
            {firstStop.address?.text ? <Text style={styles.firstAddress}>{firstStop.address.text}</Text> : null}
          </View>
        ) : null}
        <Button
          title={saving ? 'Iniciando…' : 'Iniciar ruta'}
          variant="primary"
          disabled={saving}
          onPress={start}
          style={styles.button}
        />
      </View>
      <ErrorBanner message={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  card: { backgroundColor: colors.white, borderWidth: 2, borderRadius: radius.lg, padding: spacing.lg },
  kicker: { ...typography.captionStrong, color: colors.onSurfaceVariant },
  title: { ...typography.headline, color: colors.onSurface, marginTop: spacing.xs },
  facts: { ...typography.number, color: colors.onSurface, marginTop: spacing.xs },
  first: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.cardBorder },
  firstLabel: { ...typography.caption, color: colors.onSurfaceVariant },
  firstName: { ...typography.bodyStrong, color: colors.onSurface },
  firstAddress: { ...typography.body, color: colors.onSurfaceVariant },
  button: { marginTop: spacing.lg },
});

export default StartRouteCard;
