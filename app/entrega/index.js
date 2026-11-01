// app/entrega/index.js (dueño: P3) — abre la próxima parada del motorista elegido
import { Redirect, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Button } from '../../src/components/Button';
import { EmptyState } from '../../src/features/driver/EmptyState';
import { EvidenceSkeleton } from '../../src/features/driver/LoadingSkeletons';
import { splitStops } from '../../src/features/driver/routeMath';
import { useDriverRoute } from '../../src/features/driver/useDriverRoute';
import { colors, spacing } from '../../src/theme';

export default function EntregaIndex() {
  const router = useRouter();
  const { driver, route, shipments, loading } = useDriverRoute();

  if (loading) {
    return (
      <View style={styles.loading}>
        <EvidenceSkeleton />
      </View>
    );
  }

  const next = route ? splitStops(route, shipments).next : null;
  if (next) return <Redirect href={`/entrega/${next.shipmentId}`} />;

  return (
    <View style={styles.screen}>
      <EmptyState
        icon={route ? 'check_circle' : 'event_busy'}
        tone={route ? 'success' : 'neutral'}
        title={route ? 'Ruta completada' : 'Sin parada pendiente'}
        body={
          route
            ? `${driver?.name ?? 'El motorista'} ya cerró todas las paradas de la ${route.code}.`
            : `${driver?.name ?? 'Este motorista'} no tiene una ruta asignada hoy.`
        }
      >
        <Button
          title="Ir a Vista motorista"
          icon="two_wheeler"
          variant="outlined"
          onPress={() => router.replace('/motorista')}
        />
      </EmptyState>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  screen: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', padding: spacing.lg },
});
