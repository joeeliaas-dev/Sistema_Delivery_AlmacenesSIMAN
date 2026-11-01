// app/despacho/ruta/[id].js  (dueño: P2) — Seguimiento de una ruta
// Mapa, progreso y paradas con su estado; se actualiza solo con los listen* del contrato.
// Se entra desde la tarjeta de un envío asignado o desde el aviso "Ruta optimizada".
// Dirección visual (§3 y N30): ruta y estado en el subtítulo, tres métricas (paradas, km, fin) y las
// paradas como línea de tiempo con el color de su estado (V5). ETA compartida (C21, N24).
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card } from '../../../src/components/Card';
import { Icon } from '../../../src/components/Icon';
import { RouteMap } from '../../../src/components/RouteMap';
import { StopPin, pinStyle } from '../../../src/components/RouteMapParts';
import { Skeleton } from '../../../src/components/Skeleton';
import { StatCard } from '../../../src/components/StatCard';
import { StatusBadge } from '../../../src/components/StatusBadge';
import { getDepot, listenDrivers, listenZones } from '../../../src/features/catalog/catalogService';
import { EmptyNote } from '../../../src/features/dispatch/EmptyNote';
import {
  formatClock,
  routeProgress,
  routeStageLabel,
  savedKm,
  toMapStops,
} from '../../../src/features/dispatch/dispatchMath';
import { listenRoute } from '../../../src/features/routes/routesService';
import { listenRouteShipments } from '../../../src/features/shipments/shipmentsService';
import { formatEta, remainingEtas } from '../../../src/lib/eta';
import { colors, fonts, gradients, radius, spacing, typography } from '../../../src/theme';

/** Una parada de la línea de tiempo: pin del color de su estado unido al siguiente por una línea. */
function StopRow({ row, eta, last, selected, onPress }) {
  const s = row.shipment;
  let detail;
  if (row.moved) detail = `${row.shipmentId} · reprogramado en otra ruta`;
  else if (!row.closed && eta != null) detail = `${s.code} · ${formatEta(eta)}`;
  else detail = [s.code, s.address?.municipio].filter(Boolean).join(' · ');
  // La línea toma el color de la parada (cerradas en su color; abiertas en gris)
  const line = row.closed && !row.moved ? pinStyle({ status: s.status }).border : colors.cardBorder;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.stop, selected && styles.stopSelected, pressed && styles.pressed]}
    >
      <View style={styles.rail}>
        <StopPin label={row.seq} priority={s?.priority} status={row.moved ? undefined : s?.status} />
        {!last ? <View style={[styles.railLine, { backgroundColor: line }]} /> : null}
      </View>
      <View style={styles.stopText}>
        <Text style={[styles.stopName, row.moved && styles.muted]} numberOfLines={1}>
          {s?.customer?.name ?? row.shipmentId}
        </Text>
        <Text style={styles.stopDetail} numberOfLines={1}>
          {detail}
        </Text>
      </View>
      {s && !row.moved ? (
        <View style={styles.badge}>
          <StatusBadge status={s.status} />
        </View>
      ) : null}
    </Pressable>
  );
}

// Forma de la pantalla mientras llega la ruta (C14: Skeleton, sin parpadeo)
function TrackingSkeleton() {
  return (
    <View style={styles.skeleton} accessibilityLabel="Cargando la ruta">
      <View style={styles.header}>
        <Skeleton width="40%" height={12} />
        <Skeleton width="70%" height={28} style={styles.skeletonGap} />
      </View>
      <View style={[styles.panel, styles.stats]}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.skeletonCard, styles.flex]}>
            <Skeleton width={36} height={36} />
            <Skeleton width="70%" height={20} style={styles.skeletonGap} />
          </View>
        ))}
      </View>
      <View style={[styles.panel, styles.skeletonCard]}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={styles.skeletonRow}>
            <Skeleton width={32} height={32} round />
            <View style={styles.stopText}>
              <Skeleton width="60%" height={16} />
              <Skeleton width="40%" height={12} style={styles.skeletonGap} />
            </View>
            <Skeleton width={84} height={32} round />
          </View>
        ))}
      </View>
    </View>
  );
}

export default function SeguimientoRuta() {
  const { id } = useLocalSearchParams();
  const router = useRouter();

  const [routeState, setRouteState] = useState({ id: null, route: null });
  // #6: los envíos se guardan con la ruta que los pidió (al cambiar de ruta no se mezclan)
  const [shipmentsState, setShipmentsState] = useState({ routeId: null, list: [] });
  const [drivers, setDrivers] = useState([]);
  const [zones, setZones] = useState([]);
  const [depot, setDepot] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [readError, setReadError] = useState(null); // C18

  const onReadError = useCallback((err) => setReadError(err.message), []);
  useEffect(
    () =>
      listenRoute(
        id,
        (route) => {
          setReadError(null);
          setRouteState({ id, route });
        },
        onReadError,
      ),
    [id, onReadError],
  );
  useEffect(
    () => listenRouteShipments(id, (list) => setShipmentsState({ routeId: id, list }), onReadError),
    [id, onReadError],
  );
  useEffect(() => listenDrivers(setDrivers, onReadError), [onReadError]);
  useEffect(() => listenZones(setZones, onReadError), [onReadError]);
  useEffect(() => {
    getDepot()
      .then(setDepot)
      .catch(() => setDepot(null)); // sin depósito el mapa se dibuja igual, sin el punto de salida
  }, []);

  const loading = routeState.id !== id && !readError;
  const route = routeState.id === id ? routeState.route : null;
  const byId = useMemo(
    () => Object.fromEntries((shipmentsState.routeId === id ? shipmentsState.list : []).map((s) => [s.id, s])),
    [shipmentsState, id],
  );
  const progress = routeProgress(route, byId);
  const etas = route ? remainingEtas(route, byId) : {};
  const driver = drivers.find((d) => d.id === route?.driverId);
  const zone = zones.find((z) => z.id === route?.zoneId);
  const stage = routeStageLabel(route, progress);

  const mapStops = toMapStops(
    progress.rows.filter((r) => !r.moved).map((r) => ({ ...r.shipment, stopSequence: r.seq })),
    { numbered: true },
  );

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/despacho'));

  let body;
  if (loading) body = <TrackingSkeleton />;
  else if (!route)
    body = readError ? null : (
      <EmptyNote
        icon="wrong_location"
        title="No existe la ruta"
        body={`${id} no está en los datos de hoy. Vuelva al Centro de despacho.`}
        style={styles.panel}
      />
    );
  else
    body = (
      <>
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>
            {driver?.name ?? route.driverId}
          </Text>
          <Text style={styles.subtitle}>
            {route.code} · {stage} · {zone?.name ?? route.zoneId}
          </Text>
        </View>

        <View style={[styles.panel, styles.stats]}>
          <StatCard compact icon="flag" tone="primary" label="Paradas" value={`${progress.done}/${progress.total}`} />
          <StatCard compact icon="route" tone="warning" label="Km" value={(route.totalKm ?? 0).toFixed(1)} />
          <StatCard compact icon="schedule" tone="info" label="Fin estimado" value={formatClock(route.estEnd)} />
        </View>

        <Card variant="elevated" style={styles.panel}>
          <View style={styles.progressTop}>
            <Text style={styles.progressCount}>{progress.percent}% completado</Text>
            <Text style={styles.progressSaved}>Ahorro de {savedKm(route).toFixed(1)} km</Text>
          </View>
          <View
            style={styles.bar}
            accessibilityRole="progressbar"
            accessibilityValue={{ now: progress.percent, min: 0, max: 100 }}
          >
            <View style={[styles.barFill, { width: `${progress.percent}%` }]} />
          </View>
        </Card>

        {/* En web RouteMap es una lista y repetiría la de "Paradas", que ya trae todo */}
        {Platform.OS !== 'web' ? (
          <View style={styles.panel}>
            <RouteMap
              depot={depot}
              stops={mapStops}
              showPath
              selectedId={selectedId}
              onStopPress={setSelectedId}
              height={300}
            />
          </View>
        ) : null}

        <Card variant="elevated" padded={false} style={styles.panel}>
          <Text style={styles.listTitle}>Paradas</Text>
          <View style={styles.list}>
            {progress.rows.map((row, i) => (
              <StopRow
                key={row.shipmentId}
                row={row}
                eta={etas[row.shipmentId]}
                last={i === progress.rows.length - 1}
                selected={row.shipmentId === selectedId}
                onPress={() => setSelectedId(row.shipmentId)}
              />
            ))}
          </View>
        </Card>
      </>
    );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Pressable
        onPress={goBack}
        accessibilityRole="button"
        style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        hitSlop={8}
      >
        <Icon name="arrow_back" size={22} color={colors.primary} />
        <Text style={styles.backText}>Centro de despacho</Text>
      </Pressable>
      {readError ? (
        <View style={styles.errorBox} accessibilityLiveRegion="polite">
          <Icon name="error_outline" size={20} color={colors.onErrorContainer} />
          <Text style={styles.errorText}>{readError}</Text>
        </View>
      ) : null}
      {body}
    </ScrollView>
  );
}

const PIN = 32;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingTop: spacing.xs, paddingBottom: spacing.xxxl, gap: spacing.md },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.lg,
  },
  backText: { ...typography.label, color: colors.primary },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.errorContainer,
  },
  errorText: { ...typography.body, color: colors.onErrorContainer, flex: 1 },
  skeleton: { gap: spacing.md },
  skeletonCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.white,
    gap: spacing.md,
  },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  skeletonGap: { marginTop: spacing.sm },
  flex: { flex: 1 },
  header: { paddingHorizontal: spacing.xl, gap: spacing.xxs },
  title: { ...typography.headline, fontFamily: fonts.medium, color: colors.onSurface },
  subtitle: { ...typography.body, color: colors.onSurfaceVariant },
  panel: { marginHorizontal: spacing.md },
  stats: { flexDirection: 'row', gap: spacing.sm },
  progressTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm },
  progressCount: { ...typography.titleSmall, color: colors.onSurface },
  progressSaved: { ...typography.captionStrong, color: colors.onSuccessContainer },
  bar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primaryContainer,
    marginTop: spacing.md,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 4, ...gradients.primaryBar },
  listTitle: {
    ...typography.title,
    fontFamily: fonts.medium,
    color: colors.onSurface,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },
  list: { paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  // Fila de la línea de tiempo: sin separación vertical para que la línea una los pines
  stop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    minHeight: 64,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  stopSelected: { backgroundColor: colors.primaryContainer },
  pressed: { opacity: 0.85 },
  rail: { width: PIN, alignItems: 'center', alignSelf: 'stretch', paddingTop: spacing.sm },
  railLine: { flex: 1, width: 2, marginTop: spacing.xs, borderRadius: 1, minHeight: 16 },
  stopText: { flex: 1, minWidth: 0, paddingVertical: spacing.md },
  badge: { alignSelf: 'center' },
  stopName: { ...typography.bodyStrong, color: colors.onSurface },
  muted: { color: colors.onSurfaceVariant },
  stopDetail: { ...typography.caption, color: colors.onSurfaceVariant },
});
