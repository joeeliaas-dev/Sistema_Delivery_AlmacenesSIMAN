// app/despacho/reporte.js  (dueño: P2) — Reporte del día
// Para la fecha elegida en el despacho: entregados, no entregados por motivo, devueltos, pendientes y
// sin asignar por motivo; una fila por motorista (paradas, km, ahorro y fin con routeTimes); y
// "Descargar Excel" con las hojas "Resumen" y "Pedidos" (SheetJS, la misma librería de Importar).
// Solo lectura: usa los listen* del contrato y no escribe nada. Se entra por Más → Reporte del día.
// Hasta la primera respuesta, esqueletos (nunca ceros antes de tener datos).
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import * as XLSX from 'xlsx';
import { Button } from '../../src/components/Button';
import { DateSelector } from '../../src/components/DateSelector';
import { Skeleton } from '../../src/components/Skeleton';
import { listenDrivers, listenZones } from '../../src/features/catalog/catalogService';
import { Counters } from '../../src/features/dispatch/Counters';
import { columnWidths, dayReport, reportFileName, reportSheets } from '../../src/features/dispatch/dayReport';
import { weekdayDate } from '../../src/features/dispatch/dispatchMath';
import { EmptyNote } from '../../src/features/dispatch/EmptyNote';
import { listenRoutes } from '../../src/features/routes/routesService';
import { listenShipments } from '../../src/features/shipments/shipmentsService';
import { routeColorOf } from '../../src/lib/routeColor';
import { useNow } from '../../src/lib/useNow';
import { useAppStore } from '../../src/store/useAppStore';
import { colors, radius, spacing, tones, typography } from '../../src/theme';

const NBSP = ' ';
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Un desglose por motivo: "Cliente ausente ........ 3"
function Breakdown({ title, items }) {
  if (!items.length) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{title}</Text>
      <View style={styles.box}>
        {items.map((r) => (
          <View key={r.key} style={styles.row}>
            <Text style={[styles.rowText, styles.flex]}>{r.label}</Text>
            <Text style={styles.number}>{r.count}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// Una ruta: "● Ruta B · Kevin Rivas   Asignada" y debajo "0 de 6 paradas · 14.7 km · ahorra 3.1 km · termina 07:50"
function DriverRow({ d }) {
  const meta = [
    `${d.done} de ${plural(d.total, 'parada', 'paradas')}`,
    `${d.totalKm.toFixed(1)}${NBSP}km`,
    d.savedKm >= 0.05 ? `ahorra${NBSP}${d.savedKm.toFixed(1)}${NBSP}km` : null,
    d.end ? `termina${NBSP}${d.end}` : null,
  ].filter(Boolean);
  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: routeColorOf({ code: d.code }) }]} />
      <View style={styles.flex}>
        <View style={styles.rowHead}>
          <Text style={[styles.rowTitle, styles.shrink]} numberOfLines={1}>
            {d.code} · {d.driverName}
          </Text>
          <Text style={styles.aside}>{d.stage}</Text>
        </View>
        <Text style={styles.meta}>{meta.join(' · ')}</Text>
      </View>
    </View>
  );
}

function ReportSkeleton() {
  return (
    <View style={styles.gap} accessibilityLabel="Cargando el reporte">
      <Skeleton width="70%" height={16} />
      <View style={styles.box}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={styles.row}>
            <View style={[styles.flex, styles.gapXs]}>
              <Skeleton width="50%" height={14} />
              <Skeleton width="80%" height={12} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function ReporteDelDia() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const wide = width >= 1024;
  const date = useAppStore((s) => s.date);
  const now = useNow();

  const [shipmentsState, setShipmentsState] = useState({ date: null, list: [] });
  const [routesState, setRoutesState] = useState({ date: null, list: [] });
  const [drivers, setDrivers] = useState(null);
  const [zones, setZones] = useState([]);
  const [readError, setReadError] = useState(null); // C18
  const [downloadError, setDownloadError] = useState(null);

  const onReadError = useCallback((err) => setReadError(err.message), []);
  useEffect(
    () => listenShipments({ date }, (list) => setShipmentsState({ date, list }), onReadError),
    [date, onReadError],
  );
  useEffect(() => listenRoutes({ date }, (list) => setRoutesState({ date, list }), onReadError), [date, onReadError]);
  useEffect(() => listenDrivers(setDrivers, onReadError), [onReadError]);
  useEffect(() => listenZones(setZones, onReadError), [onReadError]);

  const loading = !readError && (shipmentsState.date !== date || routesState.date !== date || drivers === null);
  const report = useMemo(
    () =>
      loading
        ? null
        : dayReport({
            shipments: shipmentsState.list,
            routes: routesState.list,
            drivers: drivers ?? [],
            zones,
            date,
            now,
          }),
    [loading, shipmentsState, routesState, drivers, zones, date, now],
  );

  function download() {
    setDownloadError(null);
    try {
      const wb = XLSX.utils.book_new();
      for (const [name, rows] of Object.entries(reportSheets(report, weekdayDate(date)))) {
        const sheet = XLSX.utils.aoa_to_sheet(rows);
        sheet['!cols'] = columnWidths(rows);
        XLSX.utils.book_append_sheet(wb, sheet, name);
      }
      XLSX.writeFile(wb, reportFileName(date));
    } catch (err) {
      setDownloadError(err.message);
    }
  }

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/despacho'));
  const parts = report
    ? [
        { key: 'total', value: report.total, label: 'pedidos' },
        { key: 'ent', value: report.entregados, label: report.entregados === 1 ? 'entregado' : 'entregados' },
        {
          key: 'no',
          value: report.noEntregados.total,
          label: report.noEntregados.total === 1 ? 'no entregado' : 'no entregados',
        },
        { key: 'dev', value: report.devueltos, label: report.devueltos === 1 ? 'devuelto' : 'devueltos' },
        { key: 'pen', value: report.pendientes, label: report.pendientes === 1 ? 'pendiente' : 'pendientes' },
        { key: 'sin', value: report.sinAsignar.total, label: 'sin asignar' },
      ]
    : [];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.column}>
        <Pressable
          onPress={goBack}
          accessibilityRole="link"
          accessibilityLabel="Volver al Centro de despacho"
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        >
          <Text style={styles.backText}>‹ Centro de despacho</Text>
        </Pressable>

        <View style={[styles.header, wide && styles.headerWide]}>
          <View style={styles.flexWide}>
            <Text style={styles.title}>Reporte del día</Text>
            <Text style={styles.subtitle}>{weekdayDate(date)}</Text>
          </View>
          <DateSelector />
          {Platform.OS === 'web' ? (
            <Button
              title="Descargar Excel"
              variant="primary"
              size="md"
              disabled={!report || !report.total}
              onPress={download}
            />
          ) : (
            <Text style={styles.hint}>El Excel se descarga desde la web</Text>
          )}
        </View>

        {readError ? <Text style={[styles.notice, styles.error]}>{readError}</Text> : null}
        {downloadError ? <Text style={[styles.notice, styles.error]}>{downloadError}</Text> : null}

        {loading ? (
          <ReportSkeleton />
        ) : !report ? null : !report.total ? (
          <EmptyNote title={`Sin pedidos el ${weekdayDate(date)}`} />
        ) : (
          <>
            <Counters parts={parts} narrow={!wide} />
            <View style={[styles.gap, wide && styles.twoCols]}>
              <View style={[styles.gap, wide && styles.col]}>
                <Breakdown title="No entregados por motivo" items={report.noEntregados.byReason} />
                <Breakdown title="Sin asignar por motivo" items={report.sinAsignar.byReason} />
                {!report.noEntregados.total && !report.sinAsignar.total ? (
                  <Text style={styles.hint}>Sin no entregados ni pedidos sin asignar.</Text>
                ) : null}
              </View>
              <View style={[styles.section, wide && styles.col]}>
                <Text style={styles.sectionLabel}>Por motorista</Text>
                {report.drivers.length ? (
                  <View style={styles.box}>
                    {report.drivers.map((d) => (
                      <DriverRow key={d.routeId} d={d} />
                    ))}
                  </View>
                ) : (
                  <Text style={styles.hint}>Sin rutas este día.</Text>
                )}
              </View>
            </View>
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingTop: spacing.xs, paddingBottom: spacing.xxxl, paddingHorizontal: spacing.lg },
  column: { width: '100%', maxWidth: 1040, alignSelf: 'center', gap: spacing.lg },
  flex: { flex: 1, minWidth: 0 },
  flexWide: { flexGrow: 1, minWidth: 0 },
  shrink: { flexShrink: 1 },
  gap: { gap: spacing.lg },
  gapXs: { gap: spacing.xs },
  pressed: { backgroundColor: colors.surfaceContainer },
  back: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', borderRadius: radius.md },
  backText: { ...typography.label, color: colors.primary },
  header: { gap: spacing.md },
  headerWide: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  title: { ...typography.headline, color: colors.onSurface },
  subtitle: { ...typography.body, color: colors.onSurfaceVariant },
  hint: { ...typography.body, color: colors.onSurfaceVariant },
  notice: {
    ...typography.body,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  error: { backgroundColor: tones.error.bg, color: colors.onErrorContainer },
  twoCols: { flexDirection: 'row', alignItems: 'flex-start' },
  col: { flex: 1, minWidth: 0 },
  section: { gap: spacing.xs },
  sectionLabel: { ...typography.caption, color: colors.onSurfaceVariant },
  box: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
  },
  rowHead: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  rowTitle: { ...typography.bodyStrong, color: colors.onSurface },
  rowText: { ...typography.body, color: colors.onSurface },
  aside: { ...typography.caption, color: colors.onSurfaceVariant },
  meta: { ...typography.caption, color: colors.onSurfaceVariant },
  number: { ...typography.number, color: colors.onSurface },
  dot: { width: 12, height: 12, borderRadius: 6 },
});
