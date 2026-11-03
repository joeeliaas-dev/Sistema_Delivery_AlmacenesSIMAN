// app/despacho/index.js  (dueño: P2) — Centro de despacho
// Lee todo por los servicios del contrato; no escribe en Firestore: "Optimizar día" y "Generar ruta
// de esta zona" llaman a routesService, que guarda las rutas y asigna los envíos por statusMachine (P1).
// Rediseño (30 oct, boceto aprobado por Andrés): barra en una línea con "Optimizar día" (la única
// acción principal) y "Más"; línea de estado en vez de tarjetas; un solo aviso a la vista; el mapa
// grande con el selector de zona encima y, a la derecha, pestañas Rutas | Sin asignar (agrupado por
// motivo). El pedido elegido se abre en el panel lateral (escritorio) o en una hoja desde abajo
// (teléfono). "Ver todos los pedidos" (Más) cambia el mapa por la lista compacta con su filtro.
// La lógica (cuentas, reglas de "Optimizar día" y "Pasar a…") viene de dispatchMath.
// Depuración (C53): una ruta por zona con Geoapify; sin vehículos, kilos, carga grande, cálculo local,
// "Pasar al día siguiente" ni reporte. Lo que no cabe (25 paradas u horario) se mueve con "Pasar a…".
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Button } from '../../src/components/Button';
import { DateSelector } from '../../src/components/DateSelector';
import { DispatchMap } from '../../src/components/DispatchMap';
import { Icon } from '../../src/components/Icon';
import { Skeleton } from '../../src/components/Skeleton';
import { UNASSIGNED_REASON } from '../../src/constants';
import { getDepot, listenDrivers, listenZones } from '../../src/features/catalog/catalogService';
import { Counters } from '../../src/features/dispatch/Counters';
import { EmptyNote } from '../../src/features/dispatch/EmptyNote';
import { Menu } from '../../src/features/dispatch/Menu';
import { MoveMenu } from '../../src/features/dispatch/MoveMenu';
import {
  REASON_LABEL,
  assignmentLabel,
  countByStage,
  droppedNote,
  isRoutable,
  latestZoneRoute,
  matchesPriority,
  moveLockedNote,
  moveTargets,
  rankMoveTargets,
  moveTargetNote,
  needsLocationReview,
  optimizeDayState,
  routeColorMap,
  savedKm,
  shortDate,
  splitByZone,
  toDispatchPins,
  toDispatchRoutes,
  unassignedCount,
  unassignedOf,
  waitingOf,
} from '../../src/features/dispatch/dispatchMath';
import { PriorityFilter, ZoneSelect } from '../../src/features/dispatch/PriorityFilter';
import { RouteToast } from '../../src/features/dispatch/RouteToast';
import { ShipmentCard, ShipmentDetail } from '../../src/features/dispatch/ShipmentCard';
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
import { routeTimes } from '../../src/lib/eta';
import { useNow } from '../../src/lib/useNow';
import { ROUTING } from '../../src/config/routing';
import { useAppStore } from '../../src/store/useAppStore';
import { colors, fonts, radius, routeColors, spacing, tones, typography } from '../../src/theme';

const indexBy = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
const WIDE = 1024; // escritorio: mapa a la izquierda y panel a la derecha; menos, pestañas
const PIN_TONES = {
  pending: tones.warning.accent,
  unassigned: tones.error.accent,
  delivered: tones.success.accent,
  fallback: colors.outline,
};
const FLASH_MS = 6000;
const NBSP = ' '; // "14.7 km" no se parte entre líneas
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const firstName = (name) => (name ?? '').split(' ')[0];

// Grupos de "Sin asignar" por motivo, en palabras de bodega; el orden es el de la lista
const REASON_GROUPS = [
  {
    reason: UNASSIGNED_REASON.CAPACIDAD,
    tone: 'error',
    title: (n) => `${n} no ${n === 1 ? 'entra' : 'entran'} en su ruta (${ROUTING.maxStops} paradas)`,
  },
  {
    reason: UNASSIGNED_REASON.VENTANA,
    tone: 'error',
    title: (n) => `${n} no ${n === 1 ? 'alcanza' : 'alcanzan'} su horario`,
  },
  {
    reason: UNASSIGNED_REASON.SIN_UBICACION,
    tone: 'warning',
    title: (n) => `${plural(n, 'dirección', 'direcciones')} por revisar`,
    review: true,
  },
];

// Aviso del optimizador en una línea: lo que va antes de ":" (el resto se lee al desplegar)
const shortWarning = (m) => m.split(':')[0].replace(/\.$/, '');
// Primero lo que no cabe en su ruta (con "Ver"); después lo demás
const warningRank = (m) => (/no caben?/.test(m) ? 0 : 1);

function ErrorBox({ message }) {
  if (!message) return null;
  return (
    <View style={[styles.notice, { backgroundColor: tones.error.bg }]} accessibilityLiveRegion="polite">
      <Text style={[styles.noticeText, { color: colors.onErrorContainer }]}>{message}</Text>
    </View>
  );
}

// Acción subrayada de un aviso ("Ver", "Revisar", "+2 avisos")
function NoticeAction({ label, onPress, disabled = false, color = tones.warning.fg }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={styles.noticeAction}
    >
      <Text style={[styles.noticeActionText, { color }, disabled && styles.disabledText]}>{label}</Text>
    </Pressable>
  );
}
const Actions = ({ list }) =>
  (list ?? []).map((a) => <NoticeAction key={a.label} label={a.label} onPress={a.onPress} disabled={a.disabled} />);

// Todos los avisos en UNA franja ámbar de una línea: el más importante con su acción y "+N avisos"
// al final, que despliega el resto (cada uno con su acción y su texto completo).
// items: [{ key, text, full?, actions?: [{ label, onPress, disabled? }] }], ya en orden de importancia. En teléfono, hasta dos
// líneas (caben en los 44 px de la franja) para que el aviso no quede cortado.
function Alerts({ items, lines = 1 }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  const [first, ...rest] = items;
  const more = rest.length || (first.full && first.full !== first.text);
  const actions = (
    <>
      <Actions list={first.actions} />
      {more ? (
        <NoticeAction
          label={open ? 'Ocultar' : rest.length ? `+${plural(rest.length, 'aviso', 'avisos')}` : 'Detalle'}
          onPress={() => setOpen((o) => !o)}
        />
      ) : null}
    </>
  );
  // En teléfono, con dos o más acciones, van en su fila debajo del texto para que el aviso se lea
  const stacked = lines > 1 && (first.actions?.length ?? 0) > 1;
  return (
    <View
      style={[styles.notice, styles.alertStrip, { backgroundColor: tones.warning.bg }]}
      accessibilityLiveRegion="polite"
    >
      <View style={[styles.noticeRow, stacked && styles.stackedText]}>
        <Text style={[styles.noticeText, { color: tones.warning.fg }]} numberOfLines={open ? undefined : lines}>
          {open ? (first.full ?? first.text) : first.text}
        </Text>
        {stacked ? null : actions}
      </View>
      {stacked ? <View style={styles.noticeActions}>{actions}</View> : null}
      {open
        ? rest.map((a) => (
            <View key={a.key} style={[styles.noticeRow, styles.noticeMore]}>
              <Text style={[styles.noticeText, { color: tones.warning.fg }]}>{a.full ?? a.text}</Text>
              <Actions list={a.actions} />
            </View>
          ))
        : null}
    </View>
  );
}

// Filas grises con forma de texto mientras llegan las rutas o los envíos
function SkeletonRows({ count = 3 }) {
  return (
    <View accessibilityLabel="Cargando">
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.skeletonRow}>
          <Skeleton width="55%" height={14} />
          <Skeleton width="80%" height={12} style={styles.skeletonGap} />
        </View>
      ))}
    </View>
  );
}

// Pestañas (Mapa | Rutas | Sin asignar): subrayado morado en la elegida
function Tabs({ tabs, value, onChange }) {
  return (
    <View style={styles.tabs} accessibilityRole="tablist">
      {tabs.map((t) => {
        const active = t.key === value;
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [styles.tab, active && styles.tabActive, pressed && styles.pressed]}
          >
            <Text style={[styles.tabText, active && styles.tabTextActive]} numberOfLines={1}>
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Una ruta de la lista: punto de color, "Ruta B · Kevin" y debajo paradas, km, fin y ahorro
function RouteRow({ route, end, color, driver, carriedFrom, onPress }) {
  const saved = savedKm(route);
  const meta = [
    plural(route.stops?.length ?? 0, 'parada', 'paradas'),
    `${(route.totalKm ?? 0).toFixed(1)}${NBSP}km`,
    end ? `termina${NBSP}${end}` : null,
    saved >= 0.05 ? `ahorra${NBSP}${saved.toFixed(1)}${NBSP}km` : null,
  ].filter(Boolean);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${route.code} de ${driver?.name ?? route.driverId}. Ver seguimiento`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={[styles.dot, { backgroundColor: color }]} />
      <View style={styles.flex}>
        <View style={styles.rowHead}>
          <Text style={[styles.rowTitle, styles.shrink]} numberOfLines={1}>
            {route.code} · {firstName(driver?.name) || route.driverId}
          </Text>
          {carriedFrom ? <Text style={styles.rowAside}>Desde el {carriedFrom}</Text> : null}
        </View>
        <Text style={styles.rowMeta} numberOfLines={2}>
          {meta.join(' · ')}
        </Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

// Un pedido sin asignar dentro de su grupo: código y cliente; abajo, municipio y "desde el …"
function UnassignedRow({ shipment, carriedFrom, selected, onPress }) {
  const s = shipment;
  const meta = [s.address?.municipio, carriedFrom ? `desde el ${carriedFrom}` : null].filter(Boolean);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${s.code}, ${s.customer?.name ?? ''}`}
      style={({ pressed }) => [styles.unRow, selected && styles.selectedRow, pressed && styles.pressed]}
    >
      <Text style={styles.unTitle} numberOfLines={1}>
        {s.code} · {s.customer?.name}
      </Text>
      {meta.length ? (
        <Text style={styles.rowMeta} numberOfLines={1}>
          {meta.join(' · ')}
        </Text>
      ) : null}
    </Pressable>
  );
}

// Un grupo de "Sin asignar": barra del color del estado, título con la cuenta y su acción; se despliega
function UnassignedGroup({ title, tone, open, onToggle, action, onAction, actionDisabled = false, children }) {
  return (
    <View style={styles.group}>
      <View style={styles.groupHead}>
        <Pressable
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          style={({ pressed }) => [styles.groupToggle, pressed && styles.pressed]}
        >
          <View style={[styles.groupBar, { backgroundColor: tones[tone].accent }]} />
          <Icon name={open ? 'expand_less' : 'expand_more'} size={20} color={colors.onSurfaceVariant} />
          <Text style={[styles.rowTitle, styles.shrink]}>{title}</Text>
        </Pressable>
        {action ? (
          <Pressable
            onPress={onAction}
            disabled={actionDisabled}
            accessibilityRole="button"
            accessibilityState={{ disabled: actionDisabled }}
            style={styles.groupAction}
          >
            <Text style={[styles.linkText, actionDisabled && styles.disabledText]}>{action}</Text>
          </Pressable>
        ) : null}
      </View>
      {open ? children : null}
    </View>
  );
}

export default function CentroDespacho() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const wide = width >= WIDE;
  const date = useAppStore((s) => s.date);
  const today = todayISO();
  const isToday = date === today;
  const isPast = date < today;
  const dayName = isToday ? 'hoy' : `el ${shortDate(date)}`;

  const [zones, setZones] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [depot, setDepot] = useState(null);
  const [depotMissing, setDepotMissing] = useState(false);
  // Las rutas se guardan con la fecha que las pidió: hasta la primera respuesta de esa fecha, "cargando"
  const [routesState, setRoutesState] = useState({ date: null, list: [] });
  const [readError, setReadError] = useState(null); // C18: mensaje listo para mostrar
  const [zoneId, setZoneId] = useState(null);
  const [priority, setPriority] = useState('todos');
  const [selectedId, setSelectedId] = useState(null);
  // Presentación: pestaña del panel, grupos abiertos de "Sin asignar" y vista mapa / todos los pedidos
  const [tab, setTab] = useState('mapa');
  const [openGroups, setOpenGroups] = useState({});
  const [showAll, setShowAll] = useState(false);
  const [flashGone, setFlashGone] = useState(null); // resultado de "Optimizar día" ya mostrado (se va solo)

  // Los envíos se guardan con la consulta que los produjo: si cambia la zona o la
  // fecha, la lista anterior deja de valer y la pantalla muestra "cargando".
  const queryKey = `${date}|${zoneId ?? ''}`;
  const [loaded, setLoaded] = useState({ key: null, list: [] });
  const shipments = loaded.key === queryKey ? loaded.list : null; // null = cargando

  // Generar ruta de una zona: en curso, último resultado (por zona) y error tal cual
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

  const now = useNow(); // las horas en vivo de las rutas avanzan cada minuto (P1)
  const onReadError = useCallback((err) => setReadError(err.message), []);
  useEffect(() => listenZones(setZones, onReadError), [onReadError]);
  useEffect(() => listenDrivers(setDrivers, onReadError), [onReadError]);
  useEffect(() => {
    getDepot()
      .then((d) => (d ? setDepot(d) : setDepotMissing(true)))
      .catch(() => setDepotMissing(true));
  }, []);
  useEffect(() => listenRoutes({ date }, (list) => setRoutesState({ date, list }), onReadError), [date, onReadError]);
  const routesLoaded = routesState.date === date;
  const routes = useMemo(() => (routesLoaded ? routesState.list : []), [routesLoaded, routesState]);
  // Sin datos todavía: esqueletos en vez de ceros (nunca "0 pedidos" antes de la primera respuesta)
  const loading = !readError && (shipments === null || !routesLoaded);
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
  // Con una zona elegida, "Optimizar día" igual mira todo el día: se leen también los envíos de la fecha (P1)
  const [dayList, setDayList] = useState({ date: null, list: null });
  useEffect(
    () => (zoneId ? listenShipments({ date }, (list) => setDayList({ date, list }), onReadError) : undefined),
    [date, zoneId, onReadError],
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
  const reviewCount = all.filter(needsLocationReview).length;
  const retryCount = retries.date === date ? retries.count : 0;
  const unassigned = unassignedOf(all);
  // Una sola cuenta para el resumen y el panel: con motivo + los que esperan otra ruta
  const waiting = waitingOf(all, routes, shipmentsById, date);
  const unCount = unassignedCount(unassigned, waiting, date);
  // "Optimizar día" solo cuando hay algo nuevo: con rutas hechas y sin pedidos nuevos no rehace nada
  const waitingIds = new Set(waiting.flatMap((g) => g.shipments.map((s) => s.id)));
  const newCount = all.filter(
    (s) => isRoutable(s) && !s.routeId && !s.unassignedReason && !waitingIds.has(s.id),
  ).length;
  const dayHasRoutes = routes.some((r) => r.date === date);
  // "Rutas al día" con los envíos de todo el día, aunque se vea una sola zona (C42)
  const dayShipments = zoneId ? (dayList.date === date ? dayList.list : null) : all;
  const upToDate = Boolean(dayShipments && optimizeDayState(dayShipments, routes, date).upToDate);
  const carriedOf = (s) => (s.scheduledDate < date ? shortDate(s.scheduledDate) : undefined);

  // Rutas que se ven (la de la zona elegida, o todas) y lo que dibuja el mapa
  const shownRoutes = zoneId ? routes.filter((r) => r.zoneId === zoneId) : routes;
  const mapRoutes = useMemo(
    () => toDispatchRoutes(shownRoutes, shipmentsById, depot, colorsById),
    [shownRoutes, shipmentsById, depot, colorsById],
  );
  const pins = useMemo(() => toDispatchPins(all, colorsById, PIN_TONES), [all, colorsById]);

  const selected = all.find((s) => s.id === selectedId) ?? null;
  const targets = rankMoveTargets(selected, moveTargets(selected, routes, shipmentsById, date), shipmentsById).map(
    (t) => ({
      id: t.route.id,
      code: t.route.code,
      color: colorsById[t.route.id],
      driverName: driversById[t.route.driverId]?.name ?? t.route.driverId,
      lacks: t.full, // llena (25 paradas): en gris y sin tocar
      note: moveTargetNote(t),
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
  const openReview = () => router.push('/despacho/ubicaciones');
  // Props de cada fila: con ruta, "Ruta X ›" lleva al seguimiento
  const cardProps = (s) => ({
    shipment: s,
    assignment: assignment(s),
    routeCode: routesById[s.routeId]?.code,
    routeColor: colorsById[s.routeId],
    carriedFrom: carriedOf(s),
    onOpenRoute: routesById[s.routeId] ? () => openRoute(s.routeId) : undefined,
  });

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

  const canGenerate = Boolean(zoneId && depot && routable.length && !routeOpen && !busy && !dayBusy && !isPast);
  let generateHint = null;
  if (depotMissing) generateHint = 'Falta el depósito de salida';
  else if (isPast) generateHint = 'Día pasado';
  else if (routeOpen) generateHint = `Ya tiene la ${zoneRoute.code}`;
  else if (!routable.length) generateHint = 'Sin pedidos pendientes';

  // Aviso de pedidos que no cupieron en la ruta de la zona (C20)
  const skipped = result?.skipped?.length ?? 0;
  const routeDriver = zoneRoute ? driversById[zoneRoute.driverId] : null;
  const dayWarnings = [...(dayResult?.warnings ?? []), ...(result?.warning ? [result.warning] : [])];

  // ——— Presentación ———
  // "4 rutas listas" junto a la línea de estado durante unos segundos
  useEffect(() => {
    if (!dayOutcome || dayOutcome.error) return undefined;
    const t = setTimeout(() => setFlashGone(dayOutcome), FLASH_MS);
    return () => clearTimeout(t);
  }, [dayOutcome]);
  const flash =
    dayResult && !dayResult.error && flashGone !== dayOutcome
      ? dayResult.routeIds.length
        ? plural(dayResult.routeIds.length, 'ruta lista', 'rutas listas')
        : 'Ninguna ruta nueva'
      : null;
  const panelTab = wide && tab === 'mapa' ? 'rutas' : tab;
  const toggleGroup = (key) => setOpenGroups((g) => ({ ...g, [key]: !g[key] }));
  function seeUnassigned() {
    setShowAll(false);
    setTab('sin');
    setOpenGroups((g) => ({ ...g, [UNASSIGNED_REASON.CAPACIDAD]: true, [UNASSIGNED_REASON.VENTANA]: true }));
  }
  const routesCount = shownRoutes.length;
  const statusParts = [
    { key: 'total', value: all.length, label: 'pedidos' },
    {
      key: 'ruta',
      value: counts.enRuta,
      label: routesCount ? `en ${routesCount === 1 ? '1 ruta' : `${routesCount} rutas`}` : 'en ruta',
    },
    ...(newCount ? [{ key: 'nuevos', value: newCount, label: newCount === 1 ? 'nuevo' : 'nuevos' }] : []),
    ...(dayHasRoutes || unCount.total ? [{ key: 'sin', value: unCount.total, label: 'sin asignar' }] : []),
    { key: 'entregados', value: counts.entregados, label: counts.entregados === 1 ? 'entregado' : 'entregados' },
  ];
  const mapHeight = wide ? Math.max(480, height - 230) : Math.max(320, Math.round(height * 0.55));

  // Avisos en orden: pedidos que no caben en su ruta (con "Ver"), los que no cupieron en la ruta de la
  // zona, direcciones por revisar y el resto del optimizador
  const sortedWarnings = [...dayWarnings].sort((a, b) => warningRank(a) - warningRank(b));
  const warningItem = (m) => ({
    key: m,
    text: shortWarning(m),
    full: m,
    actions: warningRank(m) === 0 ? [{ label: 'Ver', onPress: seeUnassigned }] : [],
  });
  const alerts = [
    ...sortedWarnings.filter((m) => warningRank(m) === 0).map(warningItem),
    ...(skipped > 0
      ? [
          {
            key: 'skipped',
            text: `${skipped === 1 ? '1 no cabe' : `${skipped} no caben`} en la ruta · quedan en Sin asignar`,
            actions: [{ label: 'Ver', onPress: seeUnassigned }],
          },
        ]
      : []),
    ...(reviewCount
      ? [
          {
            key: 'review',
            text: `${plural(reviewCount, 'dirección', 'direcciones')} por revisar`,
            actions: [{ label: 'Revisar', onPress: openReview }],
          },
        ]
      : []),
    ...sortedWarnings.filter((m) => warningRank(m) !== 0).map(warningItem),
  ];

  // "Optimizar día": la única acción sólida de la pantalla. Con las rutas al día no es un botón
  // apagado sino un estado: "✓ Rutas al día · Sin pedidos nuevos"
  const optimizeButton = upToDate ? (
    <View style={[styles.dayState, wide ? null : styles.flex]}>
      <Text style={styles.dayStateText}>
        ✓ <Text>Rutas al día</Text>
      </Text>
      <Text style={styles.hint}>Sin pedidos nuevos</Text>
    </View>
  ) : (
    <Button
      title={dayBusy ? 'Optimizando…' : 'Optimizar día'}
      variant="primary"
      size="md"
      disabled={loading || dayBusy || busy || isPast || depotMissing}
      onPress={optimizeDay}
      style={wide ? null : styles.flex}
    />
  );
  const dayHint = isPast
    ? 'Día pasado: solo consulta'
    : dayBusy
      ? 'Geoapify está calculando las rutas: puede tardar hasta un minuto'
      : null;
  const moreMenu = (
    <Menu
      label="Más"
      accessibilityLabel="Más acciones"
      align="right"
      items={[
        { key: 'importar', label: 'Importar pedidos', onPress: () => router.push('/despacho/importar') },
        { key: 'motoristas', label: 'Motoristas', onPress: () => router.push('/despacho/motoristas') },
        {
          key: 'reintentos',
          label: retryBusy ? 'Trayendo…' : `Traer reintentos (${retryCount})`,
          disabled: !retryCount || retryBusy || isPast,
          onPress: bringRetries,
        },
        showAll
          ? { key: 'mapa', label: 'Volver al mapa', onPress: () => setShowAll(false) }
          : {
              key: 'todos',
              label: loading ? 'Ver todos los pedidos' : `Ver todos los pedidos (${all.length})`,
              onPress: () => setShowAll(true),
            },
      ]}
    />
  );

  // Selector de zona y, con una zona elegida, "Generar ruta de esta zona"
  const zoneBar = (
    <View style={styles.zoneBarWrap}>
      <View style={styles.zoneBar}>
        <ZoneSelect zones={zones} value={zoneId} onChange={setZoneId} />
        {zoneId ? (
          <Button
            title={busy ? 'Calculando…' : 'Generar ruta de esta zona'}
            variant="text"
            size="md"
            disabled={!canGenerate}
            onPress={generate}
          />
        ) : null}
        {zoneId && generateHint ? <Text style={styles.hint}>{generateHint}</Text> : null}
      </View>
      {busy ? (
        <RouteToast loading />
      ) : zoneRoute && routeOpen ? (
        <RouteToast
          route={zoneRoute}
          end={routeTimes(zoneRoute, shipmentsById, now).end}
          color={colorsById[zoneRoute.id]}
          driverName={firstName(routeDriver?.name)}
          onPress={() => openRoute(zoneRoute.id)}
        />
      ) : null}
      <ErrorBox message={result?.error} />
    </View>
  );

  const mapView = loading ? (
    <View style={[styles.mapLoading, { height: mapHeight }]} accessibilityLabel="Cargando el mapa">
      <Text style={styles.hint}>Cargando…</Text>
    </View>
  ) : (
    <DispatchMap
      pins={pins}
      routes={mapRoutes}
      selectedId={selectedId}
      onPinPress={setSelectedId}
      style={{ height: mapHeight }}
    />
  );

  const routesList = loading ? (
    <SkeletonRows />
  ) : shownRoutes.length ? (
    <View>
      {shownRoutes.map((r) => (
        <RouteRow
          key={r.id}
          route={r}
          end={routeTimes(r, shipmentsById, now).end}
          color={colorsById[r.id]}
          driver={driversById[r.driverId]}
          carriedFrom={r.date < date ? shortDate(r.date) : undefined}
          onPress={() => openRoute(r.id)}
        />
      ))}
    </View>
  ) : (
    <Text style={styles.empty}>Sin rutas {dayName}. Toque Optimizar día.</Text>
  );

  const reasonGroups = REASON_GROUPS.map((g) => ({
    ...g,
    list: unassigned.filter((s) => s.unassignedReason === g.reason),
  }));
  const known = new Set(REASON_GROUPS.map((g) => g.reason));
  const otherUnassigned = unassigned.filter((s) => !known.has(s.unassignedReason));
  const rowsOf = (list) =>
    list.map((s) => (
      <UnassignedRow
        key={s.id}
        shipment={s}
        carriedFrom={carriedOf(s)}
        selected={s.id === selectedId}
        onPress={s.unassignedReason === UNASSIGNED_REASON.SIN_UBICACION ? openReview : () => setSelectedId(s.id)}
      />
    ));
  const unassignedList = loading ? (
    <SkeletonRows />
  ) : (
    <View>
      {unCount.carried ? (
        <Text style={styles.panelNote}>
          {unCount.carried} {unCount.carried === 1 ? 'viene' : 'vienen'} de días anteriores
        </Text>
      ) : null}
      {reasonGroups
        .filter((g) => g.list.length)
        .map((g) => (
          <UnassignedGroup
            key={g.reason}
            title={g.title(g.list.length)}
            tone={g.tone}
            open={Boolean(openGroups[g.reason])}
            onToggle={() => toggleGroup(g.reason)}
            action={g.review ? 'Revisar' : null}
            onAction={openReview}
          >
            {rowsOf(g.list)}
          </UnassignedGroup>
        ))}
      {otherUnassigned.length ? (
        <UnassignedGroup
          title={`${otherUnassigned.length} con otro motivo`}
          tone="error"
          open={Boolean(openGroups.otros)}
          onToggle={() => toggleGroup('otros')}
        >
          {otherUnassigned.map((s) => (
            <View key={s.id}>
              {rowsOf([s])}
              <Text style={styles.panelNote}>{REASON_LABEL[s.unassignedReason] ?? s.unassignedReason}</Text>
            </View>
          ))}
        </UnassignedGroup>
      ) : null}
      {/* Zona cuya ruta ya salió: Optimizar día no la toca; se pueden pasar a otra ruta con Pasar a… */}
      {waiting.map((g) => (
        <UnassignedGroup
          key={g.zoneId}
          title={`${g.shipments.length} ${g.shipments.length === 1 ? 'espera' : 'esperan'} otra ruta (${zoneNameOf(g.zoneId)} ya salió)`}
          tone="neutral"
          open={Boolean(openGroups[`w-${g.zoneId}`])}
          onToggle={() => toggleGroup(`w-${g.zoneId}`)}
        >
          {rowsOf(g.shipments)}
        </UnassignedGroup>
      ))}
      {unCount.total ? null : <Text style={styles.empty}>Nada sin asignar.</Text>}
    </View>
  );

  // Detalle del pedido elegido con "Pasar a…" (panel lateral o hoja de abajo)
  const detail = selected ? (
    <View style={styles.detail}>
      <View style={styles.detailHead}>
        <Text style={styles.detailTitle}>Pedido</Text>
        <Pressable
          onPress={() => setSelectedId(null)}
          accessibilityRole="button"
          accessibilityLabel="Cerrar pedido"
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}
        >
          <Icon name="close" size={22} color={colors.onSurfaceVariant} />
        </Pressable>
      </View>
      <ShipmentDetail {...cardProps(selected)} />
      {!isPast ? (
        <MoveMenu targets={targets} busyId={moveBusy} message={moveMessage} note={moveLocked} onMove={moveSelected} />
      ) : null}
    </View>
  ) : null;

  // Todos los pedidos (Más → Ver todos los pedidos): lista compacta con Express/Normal y "Sin zona"
  const allList = (
    <View style={styles.allBox}>
      <View style={styles.allHead}>
        <Text style={styles.sectionTitle}>Todos los pedidos ({visible.length})</Text>
        <Button title="Volver al mapa" variant="text" size="md" onPress={() => setShowAll(false)} />
      </View>
      <PriorityFilter value={priority} onChange={setPriority} />
      {shipments === null ? (
        <View style={styles.listBox} accessibilityLabel="Cargando envíos">
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.skeletonRow}>
              <Skeleton width="45%" height={14} />
              <Skeleton width="80%" height={12} style={styles.skeletonGap} />
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.listBox}>
          {noZone.length ? (
            <>
              <Text style={[styles.groupLabel, { color: colors.onErrorContainer, backgroundColor: tones.error.bg }]}>
                Sin zona ({noZone.length}) · no entran a ninguna ruta hasta corregirlos
              </Text>
              {noZone.map((s) => (
                <ShipmentCard
                  key={s.id}
                  {...cardProps(s)}
                  selected={s.id === selectedId}
                  onPress={() => setSelectedId(s.id)}
                />
              ))}
            </>
          ) : null}
          {zoned.map((s) => (
            <ShipmentCard
              key={s.id}
              {...cardProps(s)}
              selected={s.id === selectedId}
              onPress={() => setSelectedId(s.id)}
            />
          ))}
          {!all.length ? (
            <EmptyNote
              title={zone ? 'Sin pedidos en esta zona' : `Sin pedidos ${dayName}`}
              body={zone ? null : 'Más → Importar pedidos'}
            />
          ) : !visible.length ? (
            <EmptyNote title={`Sin pedidos ${priority === 'express' ? 'express' : 'normales'}`} />
          ) : null}
        </View>
      )}
    </View>
  );

  const rightTabs = [
    { key: 'rutas', label: loading ? 'Rutas' : `Rutas (${shownRoutes.length})` },
    { key: 'sin', label: loading ? 'Sin asignar' : `Sin asignar (${unCount.total})` },
  ];
  const sidePanel = (
    <View style={[styles.side, styles.sideWide, { maxHeight: mapHeight + 60 }]}>
      {selected ? (
        <ScrollView contentContainerStyle={styles.sidePad}>{detail}</ScrollView>
      ) : (
        <>
          <Tabs tabs={rightTabs} value={panelTab} onChange={setTab} />
          <ScrollView>{panelTab === 'sin' ? unassignedList : routesList}</ScrollView>
        </>
      )}
    </View>
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {/* Barra: título, fecha, acción principal y "Más" (zIndex: el menú cae encima del mapa) */}
      <View style={[styles.header, wide && styles.headerWide]}>
        <Text style={styles.title}>Centro de despacho</Text>
        <DateSelector />
        {wide ? <View style={styles.flex} /> : null}
        {wide ? (
          <>
            {dayHint ? <Text style={styles.hint}>{dayHint}</Text> : null}
            {optimizeButton}
            {moreMenu}
          </>
        ) : (
          <>
            {/* Teléfono: "Optimizar día" y "Más" en la misma fila */}
            <View style={styles.subBar}>
              {optimizeButton}
              {moreMenu}
            </View>
            {dayHint ? <Text style={styles.hint}>{dayHint}</Text> : null}
          </>
        )}
      </View>

      {/* Estado del día y avisos */}
      <View style={styles.status}>
        <View style={styles.statusRow}>
          {loading ? (
            <View style={styles.statusSkeleton} accessibilityLabel="Cargando el estado del día">
              <Skeleton width={wide ? 380 : 240} height={16} />
              {wide ? null : <Skeleton width={180} height={16} />}
            </View>
          ) : (
            <Counters parts={statusParts} narrow={!wide} />
          )}
          {flash ? (
            <Text style={styles.flash} accessibilityLiveRegion="polite">
              ✓ <Text>{flash}</Text>
            </Text>
          ) : null}
        </View>
        <ErrorBox message={readError} />
        <ErrorBox message={dayResult?.error} />
        {loading ? null : <Alerts key={date} items={alerts} lines={wide ? 1 : 2} />}
      </View>

      {/* Cuerpo: mapa (o todos los pedidos) y el panel de rutas / sin asignar */}
      {wide ? (
        <View style={styles.body}>
          <View style={styles.mainCol}>
            {showAll ? (
              allList
            ) : (
              <>
                {zoneBar}
                {mapView}
              </>
            )}
          </View>
          {sidePanel}
        </View>
      ) : (
        <View style={styles.phoneBody}>
          {showAll ? (
            allList
          ) : (
            <>
              <Tabs tabs={[{ key: 'mapa', label: 'Mapa' }, ...rightTabs]} value={tab} onChange={setTab} />
              {tab === 'mapa' ? (
                <>
                  {zoneBar}
                  {mapView}
                </>
              ) : (
                <View style={styles.side}>{tab === 'sin' ? unassignedList : routesList}</View>
              )}
            </>
          )}
        </View>
      )}

      {/* Teléfono: el pedido elegido sube como hoja desde abajo */}
      {wide ? null : (
        <Modal visible={Boolean(selected)} transparent animationType="slide" onRequestClose={() => setSelectedId(null)}>
          <View style={styles.sheetWrap}>
            {/* El fondo cierra al tocarlo; para el lector de pantalla queda solo la X ("Cerrar pedido") */}
            <Pressable style={styles.backdrop} onPress={() => setSelectedId(null)} accessible={false} aria-hidden />
            <View style={[styles.sheet, { maxHeight: Math.round(height * 0.8) }]}>
              <ScrollView contentContainerStyle={styles.sidePad}>{detail}</ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingTop: spacing.md, paddingBottom: spacing.xxxl, gap: spacing.md },
  flex: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1 },
  pressed: { backgroundColor: colors.surfaceContainer },
  header: { paddingHorizontal: spacing.lg, gap: spacing.sm, zIndex: 3 },
  headerWide: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.md },
  title: { ...typography.headline, color: colors.onSurface },
  subBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  hint: { ...typography.body, color: colors.onSurfaceVariant },
  status: { paddingHorizontal: spacing.lg, gap: spacing.sm, zIndex: 2 },
  notice: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md },
  noticeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  noticeText: { ...typography.body, flex: 1, minWidth: 0 },
  // La franja de avisos mide lo mismo que sus acciones (44 px): una sola línea
  alertStrip: { paddingVertical: 0 },
  statusSkeleton: { gap: spacing.xs, paddingVertical: 2 },
  mapLoading: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surfaceContainer,
  },
  stackedText: { paddingTop: spacing.sm },
  noticeActions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', columnGap: spacing.lg },
  noticeMore: { borderTopWidth: 1, borderTopColor: colors.outlineVariant, paddingVertical: spacing.xs },
  noticeAction: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }, // tocable con el dedo
  noticeActionText: { ...typography.label, textDecorationLine: 'underline' },
  statusRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: spacing.md },
  flash: { ...typography.label, color: tones.success.fg },
  disabledText: { color: colors.onSurfaceVariant, textDecorationLine: 'none' },
  dayState: {
    flexDirection: 'row',
    alignItems: 'center',
    alignContent: 'center',
    flexWrap: 'wrap',
    columnGap: spacing.sm,
    minHeight: 44,
  },
  dayStateText: { ...typography.label, color: tones.success.fg },
  body: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingHorizontal: spacing.lg },
  mainCol: { flex: 1, minWidth: 0, gap: spacing.sm },
  phoneBody: { paddingHorizontal: spacing.md, gap: spacing.sm },
  zoneBarWrap: { gap: spacing.sm, zIndex: 2 },
  zoneBar: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: spacing.sm, zIndex: 2 },
  side: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  sideWide: { width: 380, flexShrink: 0 },
  sidePad: { padding: spacing.lg },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
  },
  // Ancho según el texto (no partes iguales): "Sin asignar (85)" se lee entero a 360 px
  tab: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: colors.primary },
  tabText: { ...typography.label, color: colors.onSurfaceVariant },
  tabTextActive: { color: colors.onSurface },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 60,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
  },
  rowHead: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  rowTitle: { ...typography.bodyStrong, color: colors.onSurface },
  rowAside: { ...typography.caption, color: colors.onSurfaceVariant },
  rowMeta: { ...typography.caption, color: colors.onSurfaceVariant },
  dot: { width: 12, height: 12, borderRadius: 6 },
  chevron: { ...typography.title, color: colors.onSurfaceVariant },
  panelNote: {
    ...typography.caption,
    color: colors.onSurfaceVariant,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  empty: { ...typography.body, color: colors.onSurfaceVariant, padding: spacing.lg },
  group: { borderBottomWidth: 1, borderBottomColor: colors.outlineVariant },
  groupHead: { flexDirection: 'row', alignItems: 'center', paddingRight: spacing.md },
  groupToggle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 52,
    paddingRight: spacing.sm,
  },
  groupBar: { width: 4, alignSelf: 'stretch', marginRight: spacing.sm },
  groupAction: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm },
  linkText: { ...typography.label, color: colors.primary },
  groupLabel: { ...typography.captionStrong, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  unRow: {
    minHeight: 48,
    justifyContent: 'center',
    paddingLeft: spacing.xxxl + spacing.md,
    paddingRight: spacing.lg,
    paddingVertical: spacing.xs,
  },
  unTitle: { ...typography.body, fontFamily: fonts.medium, color: colors.onSurface },
  selectedRow: { backgroundColor: colors.primaryContainer },
  detail: { gap: spacing.md },
  detailHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  detailTitle: { ...typography.caption, color: colors.onSurfaceVariant },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
  allBox: { gap: spacing.sm },
  allHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' },
  sectionTitle: { ...typography.title, color: colors.onSurface },
  listBox: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  skeletonRow: { padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.outlineVariant },
  skeletonGap: { marginTop: spacing.sm },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.shadow, opacity: 0.32 },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    paddingBottom: spacing.xl, // aire sobre la barra del navegador del teléfono
  },
});
