// app/despacho/ruta/[id].js  (dueño: P2) — Seguimiento de una ruta
// Mapa (fuera de web), progreso y paradas con su estado; se actualiza solo con los listen* del contrato.
// Se entra desde una ruta de la lista del despacho o desde "Ruta B lista · Kevin".
// Rediseño (30 oct, mismo estilo que el despacho): título con el punto del color de la ruta (por su
// letra, routeColorOf), una línea de estado "3 de 12 paradas · 16.1 km · termina 18:47 · ahorra 1.2 km"
// con una barra fina, y las paradas como filas con su estado en texto. Sin tarjetas de números ni
// íconos de adorno. ETA compartida (C21, N24).
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RouteMap } from '../../../src/components/RouteMap';
import { StopPin } from '../../../src/components/RouteMapParts';
import { Skeleton } from '../../../src/components/Skeleton';
import { STATUS } from '../../../src/constants';
import { getDepot, listenDrivers, listenZones } from '../../../src/features/catalog/catalogService';
import { EmptyNote } from '../../../src/features/dispatch/EmptyNote';
import { routeProgress, routeStageLabel, savedKm, toMapStops } from '../../../src/features/dispatch/dispatchMath';
import { listenRoute } from '../../../src/features/routes/routesService';
import { listenRouteShipments } from '../../../src/features/shipments/shipmentsService';
import { routeTimes } from '../../../src/lib/eta';
import { useNow } from '../../../src/lib/useNow';
import { routeColorOf } from '../../../src/lib/routeColor';
import { colors, radius, spacing, statusTone, tones, typography } from '../../../src/theme';

const NBSP = ' '; // número y unidad no se parten entre líneas ("3.1 km")

// Estado de la parada en texto con su punto de color (sin píldora)
function StopStatus({ status }) {
  if (!Object.values(STATUS).includes(status)) return null;
  const t = statusTone(status);
  return (
    <View style={styles.status}>
      <View style={[styles.statusDot, { backgroundColor: t.accent }]} />
      <Text style={[styles.statusText, { color: t.fg }]}>{t.label}</Text>
    </View>
  );
}

/** Una parada: número del color de su estado, cliente, código y hora de llegada o municipio, y el estado. */
function StopRow({ row, time, selected, onPress }) {
  const s = row.shipment;
  let detail;
  if (row.moved) detail = `${row.shipmentId} · reprogramado en otra ruta`;
  else if (!row.closed && time) detail = `${s.code} · llega${NBSP}${time}`;
  else detail = [s.code, s.address?.municipio].filter(Boolean).join(' · ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.stop, selected && styles.stopSelected, pressed && styles.pressed]}
    >
      <StopPin label={row.seq} priority={s?.priority} status={row.moved ? undefined : s?.status} />
      <View style={styles.stopText}>
        <Text style={[styles.stopName, row.moved && styles.muted]} numberOfLines={1}>
          {s?.customer?.name ?? row.shipmentId}
        </Text>
        <Text style={styles.stopDetail} numberOfLines={1}>
          {detail}
        </Text>
      </View>
      {s && !row.moved ? <StopStatus status={s.status} /> : null}
    </Pressable>
  );
}

// Forma de la pantalla mientras llega la ruta (C14: Skeleton, sin parpadeo)
function TrackingSkeleton() {
  return (
    <View style={styles.gap} accessibilityLabel="Cargando la ruta">
      <View style={styles.gapSm}>
        <Skeleton width="50%" height={28} />
        <Skeleton width="80%" height={16} />
      </View>
      <View style={styles.list}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={styles.stop}>
            <Skeleton width={32} height={32} round />
            <View style={[styles.stopText, styles.gapSm]}>
              <Skeleton width="60%" height={14} />
              <Skeleton width="40%" height={12} />
            </View>
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

  const route = routeState.id === id ? routeState.route : null;
  // Esqueleto hasta tener la ruta Y sus envíos: sin ellos saldría "0 de 6 paradas" y paradas vacías
  const loading = !readError && (routeState.id !== id || (Boolean(route) && shipmentsState.routeId !== id));
  const byId = useMemo(
    () => Object.fromEntries((shipmentsState.routeId === id ? shipmentsState.list : []).map((s) => [s.id, s])),
    [shipmentsState, id],
  );
  const progress = routeProgress(route, byId);
  // Horas con la regla de P1 (C42): sin salir, lo planeado; ya salió, en vivo. Igual que el teléfono.
  const now = useNow(); // las horas en vivo avanzan cada minuto (P1)
  const times = route ? routeTimes(route, byId, now) : { live: false, end: null, stops: {} };
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
      <EmptyNote title="No existe la ruta" body={`${id} no está en los datos de hoy. Vuelva al Centro de despacho.`} />
    );
  else {
    const color = routeColorOf(route);
    const saved = savedKm(route);
    const end = times.end;
    body = (
      <>
        <View style={styles.gapSm}>
          <View style={styles.titleRow}>
            <View style={[styles.dot, { backgroundColor: color }]} />
            <Text style={[styles.title, styles.shrink]} numberOfLines={1}>
              {route.code} · {driver?.name ?? route.driverId}
            </Text>
          </View>
          <Text style={styles.subtitle}>
            {stage} · {zone?.name ?? route.zoneId}
          </Text>
        </View>

        {/* Línea de estado y barra fina del color de la ruta */}
        <View style={styles.gapSm}>
          <Text style={styles.line}>
            <Text style={styles.number}>{progress.done}</Text>
            {`${NBSP}de ${progress.total} paradas`}
            {' · '}
            <Text style={styles.number}>{(route.totalKm ?? 0).toFixed(1)}</Text>
            {`${NBSP}km`}
            {end ? (
              <>
                {` · termina${NBSP}`}
                <Text style={styles.number}>{end}</Text>
              </>
            ) : null}
            {saved >= 0.05 ? (
              <>
                {` · ahorra${NBSP}`}
                <Text style={styles.number}>{saved.toFixed(1)}</Text>
                {`${NBSP}km`}
              </>
            ) : null}
          </Text>
          <View
            style={styles.bar}
            accessibilityRole="progressbar"
            accessibilityLabel={`${progress.percent}% completado`}
            accessibilityValue={{ now: progress.percent, min: 0, max: 100 }}
          >
            <View style={[styles.barFill, { width: `${progress.percent}%`, backgroundColor: color }]} />
          </View>
        </View>

        {/* En web RouteMap es una lista y repetiría la de paradas, que ya trae todo */}
        {Platform.OS !== 'web' ? (
          <RouteMap
            depot={depot}
            stops={mapStops}
            showPath
            selectedId={selectedId}
            onStopPress={setSelectedId}
            height={300}
          />
        ) : null}

        <View>
          <Text style={styles.listTitle}>Paradas</Text>
          <View style={styles.list}>
            {progress.rows.map((row) => (
              <StopRow
                key={row.shipmentId}
                row={row}
                time={times.stops[row.shipmentId]}
                selected={row.shipmentId === selectedId}
                onPress={() => setSelectedId(row.shipmentId)}
              />
            ))}
          </View>
        </View>
      </>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.column}>
        <Pressable
          onPress={goBack}
          accessibilityRole="link"
          accessibilityLabel="Volver al Centro de despacho"
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
          hitSlop={8}
        >
          <Text style={styles.backText}>‹ Centro de despacho</Text>
        </Pressable>
        {readError ? (
          <View style={styles.errorBox} accessibilityLiveRegion="polite">
            <Text style={styles.errorText}>{readError}</Text>
          </View>
        ) : null}
        {body}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingTop: spacing.xs, paddingBottom: spacing.xxxl, paddingHorizontal: spacing.lg },
  // Una columna legible también a 1280 px
  column: { width: '100%', maxWidth: 760, alignSelf: 'center', gap: spacing.lg },
  gap: { gap: spacing.lg },
  gapSm: { gap: spacing.xs },
  shrink: { flexShrink: 1 },
  pressed: { backgroundColor: colors.surfaceContainer },
  back: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', borderRadius: radius.md },
  backText: { ...typography.label, color: colors.primary },
  errorBox: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: tones.error.bg,
  },
  errorText: { ...typography.body, color: colors.onErrorContainer },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 12, height: 12, borderRadius: 6 },
  title: { ...typography.headline, color: colors.onSurface },
  subtitle: { ...typography.body, color: colors.onSurfaceVariant },
  line: { ...typography.body, color: colors.onSurfaceVariant },
  number: { ...typography.number, color: colors.onSurface },
  bar: { height: 4, borderRadius: 2, backgroundColor: colors.outlineVariant, overflow: 'hidden' },
  barFill: { height: '100%' },
  listTitle: { ...typography.caption, color: colors.onSurfaceVariant, marginBottom: spacing.xs },
  list: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  stop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 60,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
  },
  stopSelected: { backgroundColor: colors.primaryContainer },
  stopText: { flex: 1, minWidth: 0 },
  stopName: { ...typography.bodyStrong, color: colors.onSurface },
  muted: { color: colors.onSurfaceVariant },
  stopDetail: { ...typography.caption, color: colors.onSurfaceVariant },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: typography.captionStrong,
});
