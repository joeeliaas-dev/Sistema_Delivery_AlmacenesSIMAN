// app/despacho/importar.js (dueño: P3) — Importar pedidos (S4-10)
// Tres pasos: 1 Subir (soltar o elegir el Excel/CSV, descargar plantilla), 2 Revisar (semáforo con
// filtros mientras se ubican las direcciones) y 3 Confirmar (cargar los que no tienen error).
// Solo llama a las funciones del contrato de P1: parseOrdersFile, validateOrders, resolveLocations,
// importOrders y downloadTemplate. En el teléfono no se importa: se avisa que es desde la computadora.
// Expo Router: esta pantalla no puede existir solo como .web.js, por eso decide aquí con Platform.
// Rediseño (30 oct): sin párrafos; los números en una línea de estado; al terminar, una sola acción
// principal ("Revisar 15 direcciones" si quedan pendientes, si no "Ir al despacho").
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Button } from '../../src/components/Button';
import { Icon } from '../../src/components/Icon';
import { getDepot, listenZones } from '../../src/features/catalog/catalogService';
import { ErrorBanner } from '../../src/features/driver/ErrorBanner';
import { DropZone } from '../../src/features/importer/DropZone';
import { ImportSteps } from '../../src/features/importer/ImportSteps';
import {
  loadedDate,
  loadButtonLabel,
  needsReviewCount,
  skippedNote,
  summarizeRows,
} from '../../src/features/importer/importRows';
import { RowFilters, RowsTable } from '../../src/features/importer/RowsTable';
import { importOrders, listOrderNumbers } from '../../src/features/orders/importOrders';
import { parseOrdersFile } from '../../src/features/orders/parseOrdersFile';
import { downloadTemplate } from '../../src/features/orders/template';
import { validateOrders } from '../../src/features/orders/validateOrders';
import { resolveLocations } from '../../src/features/geo/resolveLocations';
import { useDateStore } from '../../src/store/dateStore';
import { dateLabel } from '../../src/components/DateSelectorParts';
import { colors, radius, spacing, tones, typography } from '../../src/theme';

const WIDE = 760;
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

function Header({ onBack }) {
  return (
    <View style={styles.header}>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Volver al Centro de despacho"
        style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
      >
        <Icon name="arrow_back" size={20} color={colors.primary} />
        <Text style={styles.backText}>Centro de despacho</Text>
      </Pressable>
      <Text style={styles.title} accessibilityRole="header">
        Importar pedidos
      </Text>
    </View>
  );
}

function ProgressBar({ done, total }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <View
      style={styles.progress}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: total, now: done }}
    >
      <Text style={styles.progressText}>
        Ubicando {done} de {total}…
      </Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%` }]} />
      </View>
    </View>
  );
}

// Una línea de estado: "96 se cargan · 15 revisar dirección · 4 con error no se cargan"
function Summary({ summary }) {
  const parts = [
    { key: 'load', tone: 'success', text: `${summary.toLoad} ${summary.toLoad === 1 ? 'se carga' : 'se cargan'}` },
    summary.amarilla ? { key: 'review', tone: 'warning', text: `${summary.amarilla} revisar dirección` } : null,
    summary.roja ? { key: 'error', tone: 'error', text: skippedNote(summary.roja) } : null,
  ].filter(Boolean);
  return (
    <View style={styles.summary}>
      {parts.map((p) => (
        <View key={p.key} style={styles.summaryItem}>
          <View style={[styles.summaryDot, { backgroundColor: tones[p.tone].accent }]} />
          <Text style={styles.summaryText}>{p.text}</Text>
        </View>
      ))}
    </View>
  );
}

function PhoneNotice({ onBack }) {
  return (
    <View style={styles.notice}>
      <Text style={styles.noticeTitle}>Importar se hace desde la computadora</Text>
      <Button title="Volver al despacho" variant="secondary" onPress={onBack} />
    </View>
  );
}

export default function ImportarPedidos() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;
  const { date, setDate } = useDateStore();

  const [zones, setZones] = useState([]);
  const [depot, setDepot] = useState(null);

  const [step, setStep] = useState(1);
  const [fileName, setFileName] = useState(null);
  const [rows, setRows] = useState([]);
  const [reading, setReading] = useState(false);
  const [progress, setProgress] = useState(null); // { done, total } mientras se ubica
  const [filter, setFilter] = useState(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null); // { created, skipped, review }
  const [error, setError] = useState(null);
  const run = useRef(0); // descarta resultados de un archivo anterior si se elige otro a medio camino

  useEffect(() => listenZones(setZones), []);
  useEffect(() => {
    let active = true;
    getDepot()
      .then((d) => active && setDepot(d))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // El enlace dice "Centro de despacho": lleva ahí siempre, no a la pantalla anterior
  // Después de cargar, el despacho abre en la fecha de los pedidos cargados (igual que "Ir al despacho")
  const goBack = () => {
    if (result?.date) setDate(result.date);
    router.replace('/despacho');
  };

  if (Platform.OS !== 'web')
    return (
      <View style={styles.screen}>
        <PhoneNotice onBack={goBack} />
      </View>
    );

  const summary = summarizeRows(rows);
  const locating = !!progress && progress.done < progress.total;

  const onFile = async (file) => {
    const id = ++run.current;
    setError(null);
    setResult(null);
    setFilter(null);
    setReading(true);
    try {
      const { rows: raw } = await parseOrdersFile(file);
      if (!raw.length) throw new Error('El archivo no tiene filas de pedidos. Use la plantilla.');
      // Pedidos ya cargados de todas las fechas (C30): un repetido entre días distintos sale en rojo
      const existingOrderIds = await listOrderNumbers();
      const validated = validateOrders(raw, { existingOrderIds });
      if (id !== run.current) return;
      setFileName(file.name);
      setRows(validated);
      setStep(2);
      setReading(false);
      setProgress({ done: 0, total: validated.length });
      const located = await resolveLocations(validated, {
        zones,
        depot,
        onProgress: (done, total) => id === run.current && setProgress({ done, total }),
      });
      if (id !== run.current) return;
      setRows(located);
      setProgress(null);
    } catch (err) {
      if (id !== run.current) return;
      setReading(false);
      setProgress(null);
      setError(err?.message || 'No se pudo leer el archivo. Revise que sea la plantilla de pedidos.');
    }
  };

  const restart = () => {
    run.current += 1;
    setStep(1);
    setRows([]);
    setFileName(null);
    setProgress(null);
    setResult(null);
    setError(null);
  };

  const load = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await importOrders(rows, { date });
      setResult({ ...res, review: needsReviewCount(rows), date: loadedDate(rows, date) });
    } catch (err) {
      setError(err?.message || 'No se pudieron cargar los pedidos. Intente de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, wide && styles.contentWide]}>
      <Header onBack={goBack} />
      <ImportSteps current={result ? 4 : step} /* al terminar, los tres pasos en verde */ />
      <ErrorBanner message={error} />

      {step === 1 ? (
        <View style={styles.card}>
          <DropZone onFile={onFile} onTemplate={downloadTemplate} busy={reading} />
        </View>
      ) : null}

      {step === 2 ? (
        <View style={styles.card}>
          <View style={styles.fileRow}>
            <Text style={styles.fileName} numberOfLines={1}>
              {fileName} · {summary.total} {summary.total === 1 ? 'fila' : 'filas'}
            </Text>
            <Button title="Elegir otro archivo" variant="text" size="sm" onPress={restart} />
          </View>
          {locating ? <ProgressBar done={progress.done} total={progress.total} /> : null}
          <RowFilters summary={summary} value={filter} onChange={setFilter} />
          <RowsTable rows={rows} filter={filter} wide={wide} />
          <View style={[styles.actions, !wide && styles.actionsStacked]}>
            <Button
              title={locating ? 'Ubicando direcciones…' : 'Continuar'}
              disabled={locating || !summary.toLoad}
              onPress={() => setStep(3)}
            />
            {!locating && !summary.toLoad ? <Text style={styles.hint}>Ninguna fila se puede cargar</Text> : null}
          </View>
        </View>
      ) : null}

      {step === 3 && !result ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Confirme la carga</Text>
          <Summary summary={summary} />
          <View style={[styles.actions, !wide && styles.actionsStacked]}>
            <Button
              title={saving ? 'Cargando…' : loadButtonLabel(summary.toLoad)}
              disabled={saving || !summary.toLoad}
              onPress={load}
            />
            <Button title="Volver a revisar" variant="text" size="md" disabled={saving} onPress={() => setStep(2)} />
          </View>
        </View>
      ) : null}

      {step === 3 && result ? (
        <View style={[styles.card, styles.done]}>
          <Icon name="check_circle" size={40} color={tones.success.accent} />
          <Text style={styles.doneTitle} accessibilityRole="header">
            {result.created === 1 ? 'Se cargó 1 pedido' : `Se cargaron ${result.created} pedidos`}
          </Text>
          <Text style={styles.body}>
            {capitalize(dateLabel(result.date))}
            {result.skipped ? ` · ${result.skipped} sin cargar` : ''}
          </Text>
          <View style={[styles.actions, styles.actionsCenter, !wide && styles.actionsStacked]}>
            {result.review ? (
              <Button
                title={`Revisar ${result.review} ${result.review === 1 ? 'dirección' : 'direcciones'}`}
                onPress={() => {
                  setDate(result.date); // la fecha de trabajo pasa al día de los pedidos cargados
                  router.push('/despacho/ubicaciones');
                }}
              />
            ) : null}
            <Button
              title="Ir al despacho"
              variant={result.review ? 'text' : 'primary'}
              size={result.review ? 'md' : 'lg'}
              onPress={() => {
                setDate(result.date);
                router.replace('/despacho');
              }}
            />
            <Button title="Importar otro archivo" variant="text" size="md" onPress={restart} />
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl },
  contentWide: { padding: spacing.xxl, width: '100%', maxWidth: 1180, alignSelf: 'center' },
  header: { gap: spacing.xs },
  back: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 44, alignSelf: 'flex-start' },
  backPressed: { opacity: 0.7 },
  backText: { ...typography.label, color: colors.primary },
  title: { ...typography.headline, color: colors.onSurface },
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  cardTitle: { ...typography.title, color: colors.onSurface },
  body: { ...typography.body, color: colors.onSurfaceVariant },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  fileName: { ...typography.bodyStrong, color: colors.onSurface, flex: 1 },
  progress: { gap: spacing.sm },
  progressText: { ...typography.number, color: colors.onSurface },
  track: { height: 4, borderRadius: radius.full, backgroundColor: colors.surfaceHigh, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.full, backgroundColor: colors.primary },
  actions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.md },
  actionsStacked: { flexDirection: 'column', alignItems: 'stretch' },
  actionsCenter: { justifyContent: 'center' },
  hint: { ...typography.body, color: tones.error.fg },
  summary: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.lg, rowGap: spacing.sm },
  summaryItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  summaryDot: { width: 10, height: 10, borderRadius: radius.full },
  summaryText: { ...typography.number, color: colors.onSurface },
  done: { alignItems: 'center', paddingVertical: spacing.xxl },
  doneTitle: { ...typography.headline, color: colors.onSurface, textAlign: 'center' },
  notice: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xxl },
  noticeTitle: { ...typography.title, color: colors.onSurface, textAlign: 'center' },
});
