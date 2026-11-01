// app/despacho/index.js  (dueño: P2) — Centro de despacho
// Lee todo por los servicios del contrato; no escribe en Firestore: "Optimizar día" y "Generar ruta
// óptima" llaman a routesService, que guarda las rutas y asigna los envíos por statusMachine (P1).
// Sprint 4 (S4-09): barra con fecha y acciones, avisos del optimizador, rutas por color con su motor,
// DispatchMap (P3) y panel "Sin asignar". En escritorio: rutas · mapa · sin asignar en tres columnas;
// en teléfono se apilan. Dirección visual (§3 y N30): tarjetas blancas, colores por estado, sin adornos.
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { DateSelector } from '../../src/components/DateSelector';
import { DispatchMap } from '../../src/components/DispatchMap';
import { Icon } from '../../src/components/Icon';
import { IconTile } from '../../src/components/IconTile';
import { Skeleton } from '../../src/components/Skeleton';
import { PRIORITY, UNASSIGNED_REASON } from '../../src/constants';
import { getDepot, listenDrivers, listenZones } from '../../src/features/catalog/catalogService';
import { Counters } from '../../src/features/dispatch/Counters';
import { EmptyNote } from '../../src/features/dispatch/EmptyNote';
import { MoveMenu } from '../../src/features/dispatch/MoveMenu';
import {
  REASON_LABEL,
  assignmentLabel,
  countByStage,
  dateShiftLabel,
  droppedNote,
  engineLabel,
  formatClock,
  isRoutable,
  kmOptimized,
  latestZoneRoute,
  matchesPriority,
  moveLockedNote,
  moveTargets,
  rankMoveTargets,
  routeColorMap,
  shortDate,
  splitByZone,
  toDispatchPins,
  toDispatchRoutes,
  unassignedCount,
  unassignedOf,
  waitingOf,
} from '../../src/features/dispatch/dispatchMath';
import { PriorityFilter, ZoneFilter } from '../../src/features/dispatch/PriorityFilter';
import { RouteToast } from '../../src/features/dispatch/RouteToast';
import { ShipmentCard } from '../../src/features/dispatch/ShipmentCard';
import {
  createRoute,
  isRouteOpen,
  listenRoutes,
  moveStop,
  optimizeAndSaveDay,
} from '../../src/features/routes/routesService';
import { carryOverRetries, pendingRetries } from '../../src/features/shipments/carryOver';
import { listenShipments } from '../../src/features/shipments/shipmentsService';
import { todayISO } from '../../src/lib/dates';
import { GEOAPIFY_LIVE } from '../../src/lib/geoapify';
import { useAppStore } from '../../src/store/useAppStore';
import { colors, elevation, fonts, radius, routeColors, spacing, tones, typography } from '../../src/theme';

const indexBy = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
const WIDE = 1024; // escritorio: rutas · mapa · sin asignar en tres columnas
const PIN_TONES = {
  pending: tones.warning.accent,
  unassigned: tones.error.accent,
  delivered: tones.success.accent,
  fallback: colors.outline,
};

function ErrorBox({ message }) {
  if (!message) return null;
  return (
    <View style={styles.errorBox} accessibilityLiveRegion="polite">
      <Icon name="error_outline" size={20} color={colors.onErrorContainer} />
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

// Franja de avisos del optimizador (zonas que ya salieron, sin motorista, pedidos que no caben…)
function WarningStrip({ messages }) {
  if (!messages?.length) return null;
  return (
    <View style={styles.warningBox} accessibilityLiveRegion="polite">
      <Icon name="warning_amber" size={20} color={colors.onWarningContainer} />
      <View style={styles.flex}>
        {messages.map((m) => (
          <Text key={m} style={styles.warningText}>
            {m}
          </Text>
        ))}
      </View>
    </View>
  );
}

// KPI "Km optimizados" en una sola fila (N30): ícono, etiqueta, número y píldora a la derecha
function KmRow({ km, pct }) {
  const t = tones.warning;
  return (
    <View style={styles.kmRow} accessible accessibilityLabel={`Km optimizados: ${km.toFixed(1)}`}>
      <IconTile icon="route" tone="warning" size={36} />
      <Text style={styles.kmLabel} numberOfLines={1}>
        Km optimizados
      </Text>
      <Text style={styles.kmValue}>{km.toFixed(1)}</Text>
      {pct >= 0.5 ? (
        <View style={[styles.kmPill, { backgroundColor: t.bg }]}>
          <Text style={[styles.kmPillText, { color: t.fg }]} numberOfLines={1}>
            −{Math.round(pct)}%
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// Una ruta de la lista: color, motorista, paradas, km, fin y motor
function RouteRow({ route, color, driver, carriedFrom, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${route.code} de ${driver?.name ?? route.driverId}. Ver seguimiento`}
      style={({ pressed }) => [styles.routeRow, pressed && styles.pressed]}
    >
      <View style={[styles.routeBar, { backgroundColor: color }]} />
      <View style={styles.flex}>
        <View style={styles.routeHead}>
          <Text style={[styles.routeTitle, styles.shrink]} numberOfLines={1}>
            {route.code} · {driver?.name ?? route.driverId}
          </Text>
          {carriedFrom ? (
            <View style={[styles.chip, { backgroundColor: tones.neutral.bg }]}>
              <Text style={[styles.chipText, { color: tones.neutral.fg }]}>Desde el {carriedFrom}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.routeMeta} numberOfLines={1}>
          {route.stops?.length ?? 0} paradas · {(route.totalKm ?? 0).toFixed(1)} km
          {route.estEnd ? ` · fin ${formatClock(route.estEnd)}` : ''}
        </Text>
        <View style={styles.routeChips}>
          {route.engine ? (
            <View style={[styles.chip, { backgroundColor: tones.info.bg }]}>
              <Icon name="map" size={14} color={tones.info.fg} />
              <Text style={[styles.chipText, { color: tones.info.fg }]}>
                {engineLabel(route.engine, { live: GEOAPIFY_LIVE })}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      <Icon name="chevron_right" size={20} color={colors.onSurfaceVariant} />
    </Pressable>
  );
}

// Un pedido sin asignar: código y cliente; abajo, el motivo en palabras, municipio y "desde el …".
// "Sin ubicación confirmada" va en naranja.
function UnassignedRow({ shipment, reason, carriedFrom, selected, onPress }) {
  const s = shipment;
  const review = s.unassignedReason === UNASSIGNED_REASON.SIN_UBICACION;
  const tone = review ? tones.warning : s.unassignedReason ? tones.error : tones.neutral;
  const why = reason ?? REASON_LABEL[s.unassignedReason] ?? s.unassignedReason;
  const meta = [s.address?.municipio, carriedFrom ? `desde el ${carriedFrom}` : null].filter(Boolean);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${s.code}, ${s.customer?.name ?? ''}. ${why}`}
      style={({ pressed }) => [styles.unRow, selected && styles.unRowSelected, pressed && styles.pressed]}
    >
      <View style={[styles.unBar, { backgroundColor: tone.accent }]} />
      <View style={styles.flex}>
        <Text style={styles.unTitle} numberOfLines={1}>
          {s.code} · {s.customer?.name}
        </Text>
        <Text style={styles.unMeta} numberOfLines={2}>
          <Text style={[styles.unReason, { color: tone.fg }]}>{why}</Text>
          {meta.map((m) => ` · ${m}`).join('')}
        </Text>
      </View>
    </Pressable>
  );
}

export default function CentroDespacho() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;
  const date = useAppStore((s) => s.date);
  const setCurrentDriverId = useAppStore((s) => s.setCurrentDriverId);
  const today = todayISO();
  const isToday = date === today;
  const isPast = date < today;
  const dayName = isToday ? 'hoy' : `el ${shortDate(date)}`;

  const [zones, setZones] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [depot, setDepot] = useState(null);
  const [depotMissing, setDepotMissing] = useState(false);
  const [routes, setRoutes] = useState([]);
  const [readError, setReadError] = useState(null); // C18: mensaje listo para mostrar
  const [zoneId, setZoneId] = useState(null);
  const [priority, setPriority] = useState('todos');
  const [selectedId, setSelectedId] = useState(null);

  // Los envíos se guardan con la consulta que los produjo: si cambia la zona o la
  // fecha, la lista anterior deja de valer y la pantalla muestra "cargando".
  const queryKey = `${date}|${zoneId ?? ''}`;
  const [loaded, setLoaded] = useState({ key: null, list: [] });
  const shipments = loaded.key === queryKey ? loaded.list : null; // null = cargando

  // Generar ruta óptima de una zona: en curso, último resultado (por zona) y error tal cual
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState(null); // { zoneId, routeId, skipped, warning } | { zoneId, error }
  // Optimizar día y Traer reintentos: en curso y último resultado (por fecha)
  const [dayBusy, setDayBusy] = useState(false);
  const [dayOutcome, setDayOutcome] = useState(null); // { date, routeIds, warnings, engine, unassigned } | { date, error }
  const [retries, setRetries] = useState({ date: null, count: 0 });
  const [retryBusy, setRetryBusy] = useState(false);
  // Pasar a… (S4-08): ruta en curso de mover y último resultado, por pedido
  const [moveBusy, setMoveBusy] = useState(null);
  const [moveOutcome, setMoveOutcome] = useState(null); // { shipmentId, ok, text }

  const onReadError = useCallback((err) => setReadError(err.message), []);
  useEffect(() => listenZones(setZones, onReadError), [onReadError]);
  useEffect(() => listenDrivers(setDrivers, onReadError), [onReadError]);
  useEffect(() => {
    getDepot()
      .then((d) => (d ? setDepot(d) : setDepotMissing(true)))
      .catch(() => setDepotMissing(true));
  }, []);
  useEffect(() => listenRoutes({ date }, setRoutes, onReadError), [date, onReadError]);
  useEffect(
    () =>
      listenShipments(
        { date, zoneId: zoneId ?? undefined },
        (list) => {
          setReadError(null);
          setLoaded({ key: queryKey, list });
        },
        onReadError,
      ),
    [date, zoneId, queryKey, onReadError],
  );
  // "Traer reintentos (n)": no entregados de días anteriores con 1 intento (P1)
  const refreshRetries = useCallback(() => {
    let active = true;
    pendingRetries(date)
      .then((list) => active && setRetries({ date, count: list.length }))
      .catch(() => active && setRetries({ date, count: 0 }));
    return () => {
      active = false;
    };
  }, [date]);
  useEffect(refreshRetries, [refreshRetries]);

  const routesById = useMemo(() => indexBy(routes), [routes]);
  const driversById = useMemo(() => indexBy(drivers), [drivers]);
  const colorsById = useMemo(() => routeColorMap(routes, routeColors), [routes]);
  const zone = zones.find((z) => z.id === zoneId) ?? null;
  const zoneNameOf = (id) => zones.find((z) => z.id === id)?.name ?? `La zona ${id}`;
  const zoneRoute = zoneId ? latestZoneRoute(routes, zoneId) : null;

  const all = useMemo(() => shipments ?? [], [shipments]);
  const shipmentsById = useMemo(() => indexBy(all), [all]);
  const counts = countByStage(all);
  const visible = all.filter(matchesPriority(priority));
  const { zoned, noZone } = splitByZone(visible);
  const routable = all.filter(isRoutable);
  const routeOpen = Boolean(zoneRoute && shipments && isRouteOpen(zoneRoute, shipmentsById));
  const result = outcome?.zoneId === zoneId ? outcome : null;
  const dayResult = dayOutcome?.date === date ? dayOutcome : null;
  const retryCount = retries.date === date ? retries.count : 0;
  const unassigned = unassignedOf(all);
  // Una sola cuenta para el resumen y el panel: con motivo + los que esperan otra ruta
  const waiting = waitingOf(all, routes, shipmentsById);
  const unCount = unassignedCount(unassigned, waiting, date);
  const carriedOf = (s) => (s.scheduledDate < date ? shortDate(s.scheduledDate) : undefined);

  // Rutas que se ven (la de la zona elegida, o todas) y lo que dibuja el mapa
  const shownRoutes = zoneId ? routes.filter((r) => r.zoneId === zoneId) : routes;
  const mapRoutes = useMemo(
    () => toDispatchRoutes(shownRoutes, shipmentsById, depot, colorsById),
    [shownRoutes, shipmentsById, depot, colorsById],
  );
  const pins = useMemo(() => toDispatchPins(all, colorsById, PIN_TONES), [all, colorsById]);

  const selected = all.find((s) => s.id === selectedId) ?? null;
  const targets = rankMoveTargets(selected, moveTargets(selected, routes, shipmentsById, date)).map(
    ({ route: r, full }) => ({
      id: r.id,
      code: r.code,
      color: colorsById[r.id],
      driverName: driversById[r.driverId]?.name ?? r.driverId,
      full,
    }),
  );
  const moveLocked = moveLockedNote(selected, routes, shipmentsById);
  const moveMessage = moveOutcome && moveOutcome.shipmentId === selectedId ? moveOutcome : null;

  async function moveSelected(toRouteId) {
    const shipment = selected;
    setMoveBusy(toRouteId);
    try {
      const { warnings, dropped } = await moveStop(shipment.id, toRouteId);
      const extra = droppedNote(dropped, shipmentsById);
      setMoveOutcome({
        shipmentId: shipment.id,
        ok: true,
        text: `${shipment.code} pasó a la ${routesById[toRouteId]?.code ?? 'ruta'}. ${extra} ${warnings.join(' ')}`
          .replace(/\s+/g, ' ')
          .trim(),
      });
    } catch (err) {
      setMoveOutcome({ shipmentId: shipment.id, ok: false, text: err.message });
    } finally {
      setMoveBusy(null);
    }
  }
  const assignment = (s) => assignmentLabel(s, routesById, driversById);
  const openRoute = (routeId) => router.push(`/despacho/ruta/${routeId}`);
  // Props de cada tarjeta: con ruta, el chip "Ruta X - Nombre" lleva al seguimiento
  const cardProps = (s) => ({
    shipment: s,
    assignment: assignment(s),
    routeCode: routesById[s.routeId]?.code,
    carriedFrom: carriedOf(s),
    onOpenRoute: routesById[s.routeId] ? () => openRoute(s.routeId) : undefined,
  });
  const kpi = kmOptimized(routes.filter((r) => r.date === date));

  // Píldoras de contexto de los contadores (V7, desde 400 px)
  const expressWaiting = routable.filter((s) => s.priority === PRIORITY.EXPRESS).length;
  const pills = {
    pendientes: `${expressWaiting} express`,
    enRuta: `${routes.length} ${routes.length === 1 ? 'ruta' : 'rutas'}`,
    entregados: all.length ? `${Math.round((counts.entregados / all.length) * 100)}% del día` : undefined,
  };

  async function generate() {
    const forZone = zoneId;
    setBusy(true);
    setSelectedId(null);
    try {
      const { routeId, skipped, warning } = await createRoute({ zoneId: forZone, date });
      setOutcome({ zoneId: forZone, routeId, skipped, warning });
    } catch (err) {
      setOutcome({ zoneId: forZone, error: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function optimizeDay() {
    const forDate = date;
    setDayBusy(true);
    setSelectedId(null);
    try {
      setDayOutcome({ date: forDate, ...(await optimizeAndSaveDay(forDate)) });
    } catch (err) {
      setDayOutcome({ date: forDate, error: err.message });
    } finally {
      setDayBusy(false);
    }
  }

  async function bringRetries() {
    setRetryBusy(true);
    try {
      await carryOverRetries(date);
    } catch (err) {
      setDayOutcome({ date, error: err.message });
    } finally {
      setRetryBusy(false);
      refreshRetries();
    }
  }

  function goToDriver() {
    if (zone?.driverId) setCurrentDriverId(zone.driverId);
    router.replace('/motorista');
  }

  const canGenerate = Boolean(zoneId && depot && routable.length && !routeOpen && !busy && !dayBusy && !isPast);
  let generateHint = null;
  if (depotMissing) generateHint = 'Falta el depósito de salida';
  else if (isPast) generateHint = 'Es un día pasado: las rutas se generan para hoy o días siguientes.';
  else if (!zoneId) generateHint = 'Elija una zona para generar solo su ruta, u optimice todo el día.';
  else if (routeOpen) generateHint = `${zone?.name} ya tiene la ${zoneRoute.code} abierta hoy.`;
  else if (!routable.length) generateHint = 'No hay envíos pendientes en esta zona.';

  // Aviso de pedidos que no cupieron en la ruta de la zona (C20)
  const skipped = result?.skipped?.length ?? 0;
  const routeDriver = zoneRoute ? driversById[zoneRoute.driverId] : null;
  const dayWarnings = [...(dayResult?.warnings ?? []), ...(result?.warning ? [result.warning] : [])];

  // En teléfono va primero en la barra (revisión de P3); en escritorio la cierra
  const optimizeButton = (
    <Button
      title={dayBusy ? 'Optimizando…' : 'Optimizar día'}
      icon={dayBusy ? 'hourglass_empty' : 'alt_route'}
      size="md"
      disabled={dayBusy || busy || isPast || depotMissing}
      onPress={optimizeDay}
    />
  );

  const routesPanel = (
    <Card variant="elevated" padded={false} style={wide ? styles.sideCol : null}>
      <Text style={styles.panelTitle}>
        Rutas {dayName} ({shownRoutes.length})
      </Text>
      {shownRoutes.length ? (
        <View style={styles.panelList}>
          {shownRoutes.map((r) => (
            <RouteRow
              key={r.id}
              route={r}
              color={colorsById[r.id]}
              driver={driversById[r.driverId]}
              carriedFrom={r.date < date ? shortDate(r.date) : undefined}
              onPress={() => openRoute(r.id)}
            />
          ))}
        </View>
      ) : (
        <Text style={styles.panelEmpty}>Todavía no hay rutas. Toque Optimizar día.</Text>
      )}
    </Card>
  );

  const unassignedPanel = (
    <Card variant="elevated" padded={false} style={wide ? styles.sideCol : null}>
      <Text style={styles.panelTitle}>Sin asignar ({unCount.total})</Text>
      {unCount.carried ? (
        <Text style={styles.panelNote}>
          {unCount.carried} {unCount.carried === 1 ? 'viene' : 'vienen'} de días anteriores
        </Text>
      ) : null}
      {unassigned.length ? (
        <View style={styles.panelList}>
          {unassigned.map((s) => (
            <UnassignedRow
              key={s.id}
              shipment={s}
              carriedFrom={carriedOf(s)}
              selected={s.id === selectedId}
              onPress={() => setSelectedId(s.id)}
            />
          ))}
        </View>
      ) : null}
      {/* Zona cuya ruta ya salió: Optimizar día no la toca; se explica y se pueden pasar a otra ruta */}
      {waiting.map((g) => (
        <View key={g.zoneId} style={styles.panelList}>
          <Text style={styles.panelNote}>
            Esperan otra ruta ({g.shipments.length}): {zoneNameOf(g.zoneId)} ya salió con la {g.route.code}. Puede
            pasarlos a otra ruta con Pasar a…
          </Text>
          {g.shipments.map((s) => (
            <UnassignedRow
              key={s.id}
              shipment={s}
              reason={`Su zona ya salió con la ${g.route.code}`}
              carriedFrom={carriedOf(s)}
              selected={s.id === selectedId}
              onPress={() => setSelectedId(s.id)}
            />
          ))}
        </View>
      ))}
      {unCount.total ? null : <Text style={styles.panelEmpty}>Todo lo optimizado entró en una ruta.</Text>}
    </Card>
  );

  const mapPanel = (
    <View style={wide ? styles.mapCol : null}>
      <DispatchMap
        pins={pins}
        routes={mapRoutes}
        selectedId={selectedId}
        onPinPress={setSelectedId}
        style={{ height: wide ? 520 : 360 }}
      />
      {selected ? (
        <View style={styles.selected}>
          <ShipmentCard {...cardProps(selected)} selected />
          {!isPast ? (
            <MoveMenu
              targets={targets}
              busyId={moveBusy}
              message={moveMessage}
              note={moveLocked}
              onMove={moveSelected}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Centro de despacho</Text>
        <Text style={styles.subtitle}>{dateShiftLabel(date)}</Text>
        <View style={styles.dateRow}>
          <DateSelector />
        </View>
        {/* Barra de acciones del despachador (S4-09) */}
        <View style={styles.toolbar}>
          {wide ? null : optimizeButton}
          <Button
            title={retryBusy ? 'Trayendo…' : `Traer reintentos (${retryCount})`}
            icon="replay"
            variant="outlined"
            size="md"
            disabled={!retryCount || retryBusy || isPast}
            onPress={bringRetries}
          />
          {wide ? optimizeButton : null}
        </View>
        {isPast ? <Text style={styles.hint}>Es un día pasado: solo se consulta.</Text> : null}
      </View>

      <ErrorBox message={readError} />
      <ErrorBox message={dayResult?.error} />
      {dayResult && !dayResult.error ? (
        <View style={styles.panel}>
          <Text style={styles.summary} accessibilityLiveRegion="polite">
            {dayResult.routeIds.length
              ? `Se crearon ${dayResult.routeIds.length} ${dayResult.routeIds.length === 1 ? 'ruta' : 'rutas'}`
              : 'No se creó ninguna ruta nueva'}
            {` · ${unCount.total} sin asignar · ${engineLabel(dayResult.engine, { live: GEOAPIFY_LIVE })}`}
          </Text>
        </View>
      ) : null}
      <View style={styles.panel}>
        <WarningStrip messages={dayWarnings} />
      </View>

      <View style={styles.panel}>
        <KmRow km={kpi.km} pct={kpi.pct} />
      </View>

      <View style={styles.zones}>
        <ZoneFilter zones={zones} value={zoneId} onChange={setZoneId} />
      </View>

      <View style={styles.panel}>
        <View style={styles.scope}>
          <Icon name={zone ? 'place' : 'public'} size={16} color={colors.onSurfaceVariant} />
          <Text style={styles.scopeText} numberOfLines={1}>
            {isToday ? 'Hoy' : `El ${shortDate(date)}`} en {zone ? zone.name : 'todas las zonas'}
          </Text>
        </View>
        <Counters pendientes={counts.pendientes} enRuta={counts.enRuta} entregados={counts.entregados} pills={pills} />
      </View>

      {/* Rutas · mapa · sin asignar */}
      <View style={[styles.panel, wide ? styles.mainRow : styles.mainCol]}>
        {routesPanel}
        {mapPanel}
        {unassignedPanel}
      </View>

      {/* Ruta de una sola zona: "Generar ruta óptima" (la usa la demo automática) */}
      <Card variant="elevated" padded={false} style={styles.panel}>
        <View style={styles.zoneHead}>
          <Text style={styles.panelTitleInline}>Ruta de una zona</Text>
          <Text style={styles.subtitle}>
            {zone ? zone.name : 'Elija una zona arriba'}
            {zone ? ` · ${routable.length} ${routable.length === 1 ? 'pendiente' : 'pendientes'}` : ''}
          </Text>
          {zoneRoute && routeOpen ? (
            <View style={styles.routeLine}>
              <Icon name="two_wheeler" size={16} color={colors.onSurfaceVariant} />
              <Text style={styles.routeLineText} numberOfLines={1}>
                {zoneRoute.code}
                {routeDriver ? ` - ${routeDriver.name}` : ''}
              </Text>
            </View>
          ) : null}
          <View style={styles.actions}>
            <Button
              title="Vista motorista"
              icon="smartphone"
              variant="outlined"
              size="md"
              onPress={goToDriver}
              style={styles.grow}
            />
            <Button
              title={busy ? 'Calculando…' : 'Generar ruta óptima'}
              icon={busy ? 'hourglass_empty' : 'route'}
              size="md"
              disabled={!canGenerate}
              onPress={generate}
              style={styles.grow}
            />
          </View>
          {generateHint ? <Text style={styles.hint}>{generateHint}</Text> : null}
        </View>
        {busy || (zoneRoute && routeOpen) || skipped > 0 || result?.error ? (
          <View style={styles.zoneBody}>
            {busy ? (
              <RouteToast loading />
            ) : zoneRoute && routeOpen ? (
              <RouteToast route={zoneRoute} driverName={routeDriver?.name} onPress={() => openRoute(zoneRoute.id)} />
            ) : null}
            {skipped > 0 ? (
              <View style={styles.warningBox}>
                <Icon name="warning_amber" size={20} color={colors.onWarningContainer} />
                <Text style={[styles.warningText, styles.flex]}>
                  {skipped} {skipped === 1 ? 'pedido no cabe' : 'pedidos no caben'} en la ruta y{' '}
                  {skipped === 1 ? 'queda' : 'quedan'} en Sin asignar.
                </Text>
              </View>
            ) : null}
            <ErrorBox message={result?.error} />
          </View>
        ) : null}
      </Card>

      {/* Todos los envíos de la fecha (y los abiertos de días anteriores, N37) */}
      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Envíos ({visible.length})</Text>
        <View style={styles.filters}>
          <PriorityFilter value={priority} onChange={setPriority} />
        </View>
      </View>
      {shipments === null ? (
        <View style={styles.list} accessibilityLabel="Cargando envíos">
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.skeletonCard}>
              <Skeleton width="45%" height={12} />
              <Skeleton width="65%" height={20} style={styles.skeletonGap} />
              <Skeleton width="90%" height={14} style={styles.skeletonGap} />
              <Skeleton width={140} height={28} style={styles.skeletonGap} />
            </View>
          ))}
        </View>
      ) : (
        <View style={[styles.list, wide && styles.listWide]}>
          {noZone.length ? (
            <View style={styles.noZone}>
              <View style={styles.noZoneHead}>
                <Icon name="wrong_location" size={20} color={colors.onErrorContainer} />
                <Text style={styles.noZoneTitle}>Sin zona ({noZone.length})</Text>
              </View>
              <Text style={styles.noZoneBody}>
                Su ubicación no cae en ninguna zona ni municipio conocido. No entran a ninguna ruta hasta corregirlos.
              </Text>
              {noZone.map((s) => (
                <ShipmentCard
                  key={s.id}
                  {...cardProps(s)}
                  selected={s.id === selectedId}
                  onPress={() => setSelectedId(s.id)}
                />
              ))}
            </View>
          ) : null}
          {zoned.map((s) => (
            <View key={s.id} style={wide ? styles.cardWide : null}>
              <ShipmentCard {...cardProps(s)} selected={s.id === selectedId} onPress={() => setSelectedId(s.id)} />
            </View>
          ))}
          {!all.length ? (
            <EmptyNote
              icon="inbox"
              title={zone ? 'No hay envíos en esta zona' : `No hay envíos ${dayName}`}
              body={
                zone
                  ? `${zone.name} no tiene envíos programados para ${dayName}.`
                  : `Cuando lleguen pedidos para ${dayName} aparecerán aquí.`
              }
            />
          ) : !visible.length ? (
            <EmptyNote
              icon="filter_alt_off"
              title={`No hay envíos ${priority === 'express' ? 'express' : 'normales'}`}
              body="Toque Todos para ver el resto."
            />
          ) : null}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingTop: spacing.sm, paddingBottom: spacing.xxxl, gap: spacing.md },
  flex: { flex: 1, minWidth: 0 },
  header: { paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, gap: spacing.xs },
  title: { ...typography.headline, fontFamily: fonts.medium, color: colors.onSurface },
  subtitle: { ...typography.body, color: colors.onSurfaceVariant },
  dateRow: { marginTop: spacing.xs },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  summary: { ...typography.bodyStrong, color: colors.onSurface },
  zones: { marginHorizontal: -spacing.xs },
  kmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 60,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.white,
    ...elevation[1],
  },
  kmLabel: { ...typography.body, color: colors.onSurfaceVariant, flex: 1 },
  kmValue: { ...typography.title, fontFamily: fonts.bold, color: colors.onSurface, fontVariant: ['tabular-nums'] },
  kmPill: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  kmPillText: typography.captionStrong,
  panel: { marginHorizontal: spacing.md },
  mainRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  mainCol: { gap: spacing.md },
  sideCol: { width: 320, flexShrink: 0 },
  mapCol: { flex: 1, minWidth: 0 },
  panelTitle: {
    ...typography.titleSmall,
    color: colors.onSurface,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  panelTitleInline: { ...typography.titleSmall, color: colors.onSurface },
  panelList: { paddingBottom: spacing.sm },
  panelNote: {
    ...typography.caption,
    color: colors.onSurfaceVariant,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  panelEmpty: {
    ...typography.body,
    color: colors.onSurfaceVariant,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 64,
    paddingVertical: spacing.sm,
    paddingRight: spacing.md,
  },
  routeBar: { width: 4, alignSelf: 'stretch', borderTopRightRadius: 2, borderBottomRightRadius: 2 },
  routeTitle: { ...typography.bodyStrong, color: colors.onSurface },
  routeHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  shrink: { flexShrink: 1 },
  routeMeta: { ...typography.caption, color: colors.onSurfaceVariant },
  routeChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    flexShrink: 1,
  },
  chipText: { ...typography.captionStrong },
  unRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  unRowSelected: { backgroundColor: colors.primaryContainer },
  unTitle: { ...typography.bodyStrong, color: colors.onSurface },
  unMeta: { ...typography.caption, color: colors.onSurfaceVariant },
  unReason: { ...typography.captionStrong },
  unBar: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  pressed: { opacity: 0.85 },
  zoneHead: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.lg },
  zoneBody: { marginHorizontal: spacing.md, marginBottom: spacing.md, gap: spacing.md },
  sectionTitle: { ...typography.title, fontFamily: fonts.medium, color: colors.onSurface },
  filters: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  skeletonCard: {
    padding: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.white,
  },
  skeletonGap: { marginTop: spacing.sm },
  scope: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  scopeText: { ...typography.captionStrong, color: colors.onSurfaceVariant, flexShrink: 1 },
  list: { paddingHorizontal: spacing.md, gap: spacing.sm },
  listWide: { flexDirection: 'row', flexWrap: 'wrap' },
  cardWide: { width: '32.5%', minWidth: 300, flexGrow: 1 },
  noZone: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.errorContainer,
    width: '100%',
  },
  noZoneHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  noZoneTitle: { ...typography.titleSmall, color: colors.onErrorContainer },
  noZoneBody: { ...typography.caption, color: colors.onErrorContainer },
  routeLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xxs },
  routeLineText: { ...typography.bodyStrong, color: colors.onSurfaceVariant, flexShrink: 1 },
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
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.warningContainer,
  },
  warningText: { ...typography.body, color: colors.onWarningContainer },
  selected: { marginTop: spacing.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  grow: { flexGrow: 1 },
  hint: { ...typography.caption, color: colors.onSurfaceVariant, marginTop: spacing.sm },
});
