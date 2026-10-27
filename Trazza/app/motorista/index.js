import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Skeleton } from '../../src/components/Skeleton';
import { StatusBadge } from '../../src/components/StatusBadge';
import { ROUTE_STATUS, STATUS } from '../../src/constants';
import { DriverAvatar } from '../../src/features/driver/DriverAvatar';
import { DriverPicker } from '../../src/features/driver/DriverPicker';
import { EmptyState } from '../../src/features/driver/EmptyState';
import { DriverRouteSkeleton } from '../../src/features/driver/LoadingSkeletons';
import { NextStopCard } from '../../src/features/driver/NextStopCard';
import { RouteProgress } from '../../src/features/driver/RouteProgress';
import { StartRouteCard } from '../../src/features/driver/StartRouteCard';
import { StopList } from '../../src/features/driver/StopList';
import { greeting, splitStops } from '../../src/features/driver/routeMath';
import { useDriverRoute } from '../../src/features/driver/useDriverRoute';
import { useAppStore } from '../../src/store/useAppStore';
import { colors, spacing, typography } from '../../src/theme';
const ROUTE_BADGE = {
  [ROUTE_STATUS.ASIGNADA]: STATUS.ASIGNADO,
  [ROUTE_STATUS.EN_CURSO]: STATUS.EN_RUTA,
};
function RouteBody({ route, shipments, driverId, onArrived }) {
  const { next, remaining, completed, done, total, percent } = splitStops(route, shipments);
  return (
    <>
      {}
      {route.status !== ROUTE_STATUS.ASIGNADA ? (
        <RouteProgress routeCode={route.code} done={done} total={total} percent={percent} estEnd={route.estEnd} />
      ) : null}
      {route.status === ROUTE_STATUS.ASIGNADA ? (
        <StartRouteCard route={route} driverId={driverId} firstStop={next?.shipment} />
      ) : next ? (
        <NextStopCard shipment={next.shipment} eta={next.eta} onArrived={() => onArrived(next.shipmentId)} />
      ) : (
        <EmptyState
          icon="check_circle"
          tone="success"
          title="Ruta completada"
          body={`Se cerraron las ${total} paradas de la ${route.code}.`}
        />
      )}
      {route.status === ROUTE_STATUS.ASIGNADA ? (
        <StopList
          remaining={next ? [next, ...remaining] : remaining}
          completed={completed}
          title="Paradas de la ruta"
        />
      ) : (
        <StopList remaining={remaining} completed={completed} onStopPress={onArrived} />
      )}
    </>
  );
}
export default function VistaMotorista() {
  const router = useRouter();
  const setCurrentDriverId = useAppStore((s) => s.setCurrentDriverId);
  const { drivers, driverId, driver, zone, route, shipments, loading } = useDriverRoute();
  let body;
  if (loading) body = <DriverRouteSkeleton />;
  else if (!route)
    body = (
      <EmptyState
        icon="event_busy"
        title="Sin ruta para hoy"
        body={`${driver?.name ?? 'Este motorista'} no tiene una ruta asignada. Cuando el Centro de despacho genere la ruta de su zona, aparecerá aquí.`}
      />
    );
  else
    body = (
      <RouteBody
        route={route}
        shipments={shipments}
        driverId={driverId}
        onArrived={(id) => router.push(`/entrega/${id}`)}
      />
    );
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          {driver ? (
            <DriverAvatar initials={driver.initials} color={zone?.color} />
          ) : (
            <Skeleton width={48} height={48} round />
          )}
          <View style={styles.headerText}>
            <Text style={styles.greeting}>{greeting()}</Text>
            {driver ? (
              <Text style={styles.name} numberOfLines={1}>
                {driver.name}
              </Text>
            ) : (
              <Skeleton width={140} height={22} style={styles.nameSkeleton} />
            )}
            {}
            {zone ? (
              <Text style={styles.subtitle} numberOfLines={2}>
                {zone.name}
              </Text>
            ) : null}
          </View>
          {ROUTE_BADGE[route?.status] ? <StatusBadge status={ROUTE_BADGE[route.status]} /> : null}
        </View>
      </View>
      <DriverPicker drivers={drivers} selectedId={driverId} onSelect={setCurrentDriverId} />
      <ScrollView contentContainerStyle={styles.content}>{body}</ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  greeting: {
    ...typography.caption,
    color: colors.onSurfaceVariant,
  },
  subtitle: {
    ...typography.body,
    color: colors.onSurfaceVariant,
  },
  name: {
    ...typography.title,
    fontFamily: typography.fonts.bold,
    fontSize: 20,
    lineHeight: 26,
    color: colors.onSurface,
  },
  nameSkeleton: {
    marginTop: spacing.xs,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
});
