// app/motorista/index.js (dueño: P3) — Vista motorista
// Rediseño (30 oct): encabezado de una línea (nombre, zona, estado y "Más"); progreso en una
// línea con barra delgada; Próxima parada blanca con el borde del color de la ruta; la lista de
// paradas; y "Llegué al destino" fijo abajo, al alcance del pulgar (la acción principal).
// El cambio de motorista es una herramienta de prueba: queda escondido en "Más", y solo en modo datos de
// prueba con sesión de despachador (con sesión de motorista se ve su ruta, la de user.driverId).
// "Cerrar sesión" también va en "Más".
// Horas: routeTimes (P1, C42) una vez para toda la pantalla: sin salir, todo planeado; ya salió,
// todo en vivo. Las mismas que ve el despacho.
// Color de la ruta: routeColorOf (letra de la ruta), el mismo que en el mapa del despacho.
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../src/components/Button';
import { Skeleton } from '../../src/components/Skeleton';
import { StatusBadge } from '../../src/components/StatusBadge';
import { ROUTE_STATUS, STATUS } from '../../src/constants';
import { DriverPicker } from '../../src/features/driver/DriverPicker';
import { EmptyState } from '../../src/features/driver/EmptyState';
import { DriverRouteSkeleton } from '../../src/features/driver/LoadingSkeletons';
import { NextStopCard } from '../../src/features/driver/NextStopCard';
import { RouteProgress } from '../../src/features/driver/RouteProgress';
import { StartRouteCard } from '../../src/features/driver/StartRouteCard';
import { StopList } from '../../src/features/driver/StopList';
import { SubmitBar } from '../../src/features/driver/SubmitBar';
import { splitStops } from '../../src/features/driver/routeMath';
import { useDriverRoute } from '../../src/features/driver/useDriverRoute';
import { ROLE, signOut, useSession } from '../../src/lib/auth';
import { routeTimes } from '../../src/lib/eta';
import { USE_MOCKS } from '../../src/lib/firebase';
import { useNow } from '../../src/lib/useNow';
import { routeColorOf } from '../../src/lib/routeColor';
import { useAppStore } from '../../src/store/useAppStore';
import { colors, spacing, typography } from '../../src/theme';

// Etiqueta del encabezado según el estado de la ruta
const ROUTE_BADGE = { [ROUTE_STATUS.ASIGNADA]: STATUS.ASIGNADO, [ROUTE_STATUS.EN_CURSO]: STATUS.EN_RUTA };

function RouteBody({ route, shipments, split, driverId, color, onOpenStop }) {
  const { next, remaining, completed, done, total, percent } = split;
  const now = useNow(); // las horas en vivo avanzan cada minuto (P1)
  const times = routeTimes(route, Object.fromEntries(shipments.map((s) => [s.id, s])), now);
  if (route.status === ROUTE_STATUS.ASIGNADA)
    return (
      <>
        {/* Antes de salir se ve la ruta completa (incluida la primera parada) y no se atiende nada */}
        <StartRouteCard route={route} driverId={driverId} firstStop={next?.shipment} end={times.end} color={color} />
        <StopList
          remaining={next ? [next, ...remaining] : remaining}
          completed={completed}
          times={times.stops}
          color={color}
          title="Paradas de la ruta"
        />
      </>
    );
  return (
    <>
      <RouteProgress routeCode={route.code} end={times.end} done={done} total={total} percent={percent} color={color} />
      {next ? (
        <NextStopCard shipment={next.shipment} arrives={times.stops[next.shipmentId]} color={color} />
      ) : (
        <EmptyState icon="check_circle" tone="success" title="Ruta completada" body={`${total} de ${total} paradas.`} />
      )}
      <StopList
        remaining={remaining}
        completed={completed}
        times={times.stops}
        onStopPress={onOpenStop}
        color={color}
      />
    </>
  );
}

export default function VistaMotorista() {
  const router = useRouter();
  const setCurrentDriverId = useAppStore((s) => s.setCurrentDriverId);
  const { drivers, driverId, driver, zone, route, shipments, loading } = useDriverRoute();
  const [menuOpen, setMenuOpen] = useState(false);
  const { status, user } = useSession();
  const canPick = USE_MOCKS && user?.role === ROLE.DESPACHO;
  const logout = async () => {
    setMenuOpen(false);
    await signOut(); // app/_layout.js (P1) lleva a /login
  };

  const color = route ? routeColorOf(route) : colors.primary;
  const split = route ? splitStops(route, shipments) : null;
  const openStop = (id) => router.push(`/entrega/${id}`);
  const arriveAt = !loading && route?.status === ROUTE_STATUS.EN_CURSO ? split?.next : null;

  let body;
  if (loading) body = <DriverRouteSkeleton />;
  else if (!route)
    body = <EmptyState icon="event_busy" title="Sin ruta para hoy" body="Aparece aquí cuando despacho la arme." />;
  else
    body = (
      <RouteBody
        route={route}
        shipments={shipments}
        split={split}
        driverId={driverId}
        color={color}
        onOpenStop={openStop}
      />
    );

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          {driver ? (
            <Text style={styles.name} numberOfLines={1}>
              {driver.name}
            </Text>
          ) : (
            <Skeleton width={160} height={24} />
          )}
          {zone ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {zone.name}
            </Text>
          ) : null}
        </View>
        {ROUTE_BADGE[route?.status] ? <StatusBadge status={ROUTE_BADGE[route.status]} quiet /> : null}
        {canPick || status === 'signedIn' ? (
          <Button
            title="Más"
            icon={menuOpen ? 'expand_less' : 'more_vert'}
            variant="text"
            size="sm"
            accessibilityLabel="Más opciones"
            onPress={() => setMenuOpen(!menuOpen)}
          />
        ) : null}
      </View>
      {menuOpen ? (
        <View style={styles.column}>
          {canPick ? (
            <DriverPicker
              drivers={drivers}
              selectedId={driverId}
              onSelect={(id) => {
                setCurrentDriverId(id);
                setMenuOpen(false);
              }}
            />
          ) : null}
          {status === 'signedIn' ? (
            <View style={styles.session}>
              <Text style={styles.sessionText} numberOfLines={1}>
                {user.email}
              </Text>
              <Button title="Cerrar sesión" variant="secondary" size="md" onPress={logout} />
            </View>
          ) : null}
        </View>
      ) : null}
      <ScrollView contentContainerStyle={styles.content}>{body}</ScrollView>
      {arriveAt ? (
        <SubmitBar title="Llegué al destino" icon={null} missing={[]} onSubmit={() => openStop(arriveAt.shipmentId)} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  // En escritorio la vista queda en una columna de teléfono ancho, centrada
  column: { width: '100%', maxWidth: 640, alignSelf: 'center' },
  session: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  sessionText: { ...typography.body, color: colors.onSurfaceVariant, flex: 1, minWidth: 0 },
  header: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    paddingVertical: spacing.sm,
  },
  headerText: { flex: 1, minWidth: 0 },
  name: { ...typography.headline, color: colors.onSurface },
  subtitle: { ...typography.body, color: colors.onSurfaceVariant },
  content: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
});
