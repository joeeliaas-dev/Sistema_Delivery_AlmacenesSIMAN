// app/despacho/ubicaciones.js (dueño: P3) — Revisar ubicaciones (S4-12)
// Pedidos pendientes de la fecha elegida con ubicación "revisar" o "sin_ubicacion": se elige uno,
// se arrastra su pin en el mapa y "Confirmar ubicación" llama a confirmLocation(id, punto, 'despacho')
// de P1 (lo guarda en el envío). "Siguiente" pasa al otro sin confirmar.
// La pantalla no decide la confianza (N40): solo lee location.status.
// Rediseño (30 oct): motivo corto ("Dirección dudosa") y el detalle al tocarlo; sin párrafos;
// "Confirmar ubicación" es la única acción principal.
// Hasta que llegan los pedidos de la fecha elegida (y las zonas, que ubican los pines sin
// dirección): esqueleto, no "Todas las direcciones están revisadas" ni "Quedan 0".
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Button } from '../../src/components/Button';
import { DispatchMap } from '../../src/components/DispatchMap';
import { DateSelector } from '../../src/components/DateSelector';
import { dateLabel } from '../../src/components/DateSelectorParts';
import { Icon } from '../../src/components/Icon';
import { Skeleton } from '../../src/components/Skeleton';
import { LOCATION_SOURCE, LOCATION_STATUS } from '../../src/constants';
import { getDepot, listenZones } from '../../src/features/catalog/catalogService';
import { ErrorBanner } from '../../src/features/driver/ErrorBanner';
import { confirmLocation } from '../../src/features/geo/confirmLocation';
import {
  remainingLabel,
  reviewDetail,
  reviewQueue,
  reviewReason,
  startPoint,
} from '../../src/features/review/reviewMath';
import { ReviewSkeleton } from '../../src/features/review/ReviewSkeleton';
import { listenShipmentsByDate } from '../../src/features/shipments/shipmentsService';
import { useDateStore } from '../../src/store/dateStore';
import { colors, radius, spacing, tones, typography } from '../../src/theme';

const WIDE = 900;
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

function Header({ onBack, date, count }) {
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
        Revisar ubicaciones
      </Text>
      {count == null ? (
        <View style={styles.subtitleRow}>
          <Text style={styles.subtitle}>{capitalize(dateLabel(date))} · </Text>
          <Skeleton width={120} height={14} />
        </View>
      ) : (
        <Text style={styles.subtitle}>
          {capitalize(dateLabel(date))} · {remainingLabel(count)} por revisar
        </Text>
      )}
    </View>
  );
}

function QueueItem({ s, selected, onPress }) {
  const missing = s.location?.status === LOCATION_STATUS.SIN_UBICACION;
  const t = missing ? tones.error : tones.warning;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${s.orderNumber ?? s.id}, ${s.customer?.name ?? ''}`}
      style={({ pressed }) => [
        styles.item,
        selected && styles.itemSelected,
        pressed && !selected && styles.itemPressed,
      ]}
    >
      <View style={styles.itemText}>
        <Text style={styles.itemCode}>{s.orderNumber ?? s.id}</Text>
        <Text style={styles.itemName} numberOfLines={1}>
          {s.customer?.name ?? 'Sin cliente'}
        </Text>
        <Text style={styles.itemAddress} numberOfLines={1}>
          {[s.address?.text, s.address?.municipio].filter(Boolean).join(', ')}
        </Text>
      </View>
      <Text style={[styles.itemTag, { color: t.fg, backgroundColor: t.bg }]}>
        {missing ? 'No encontrada' : 'Dudosa'}
      </Text>
    </Pressable>
  );
}

function SelectedCard({ s, moved, saving, onConfirm, onNext, remaining, hasNext }) {
  const [showDetail, setShowDetail] = useState(false);
  const detail = reviewDetail(s);
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.itemCode}>{s.orderNumber ?? s.id}</Text>
        <Text style={styles.remaining}>{remainingLabel(remaining)}</Text>
      </View>
      <Text style={styles.cardName}>{s.customer?.name ?? 'Sin cliente'}</Text>
      <Text style={styles.cardAddress}>{[s.address?.text, s.address?.municipio].filter(Boolean).join(', ')}</Text>
      {s.address?.reference ? (
        <View style={styles.reference}>
          <Text style={styles.referenceLabel}>Referencia</Text>
          <Text style={styles.referenceText}>{s.address.reference}</Text>
        </View>
      ) : null}
      <Pressable
        onPress={() => setShowDetail(!showDetail)}
        disabled={!detail}
        accessibilityRole={detail ? 'button' : undefined}
        accessibilityState={detail ? { expanded: showDetail } : undefined}
        style={styles.reasonRow}
      >
        <View style={styles.reasonDot} />
        <Text style={styles.reason}>{reviewReason(s)}</Text>
        {detail ? <Text style={styles.reasonMore}>{showDetail ? 'Ocultar' : 'Ver detalle'}</Text> : null}
      </Pressable>
      {showDetail && detail ? <Text style={styles.detail}>{detail}</Text> : null}
      <Text style={styles.help}>{moved ? 'Pin movido. Confirme.' : 'Arrastre el pin grande a la casa.'}</Text>
      <View style={styles.actions}>
        <Button
          title={saving ? 'Guardando…' : 'Confirmar ubicación'}
          disabled={saving}
          onPress={onConfirm}
          style={styles.grow}
        />
        <Button
          title="Siguiente"
          variant="secondary"
          disabled={saving || !hasNext}
          onPress={onNext}
          style={styles.grow}
        />
      </View>
    </View>
  );
}

export default function RevisarUbicaciones() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;
  const { date } = useDateStore();

  // Los pedidos van con su fecha: al cambiarla no se muestran los del día anterior como si fueran de este
  const [shipState, setShipState] = useState({ date: null, list: null });
  const [zones, setZones] = useState(null);
  const [depot, setDepot] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [drafts, setDrafts] = useState({}); // { [id]: { lat, lng } } pines arrastrados sin confirmar
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(
    () =>
      listenShipmentsByDate(
        date,
        (list) => setShipState({ date, list }),
        (err) => setError(err.message),
      ),
    [date],
  );
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
  const goBack = () => router.replace('/despacho');
  const shipments = shipState.date === date ? shipState.list : null;
  const loading = shipments === null || zones === null;
  const queue = reviewQueue(shipments ?? []);
  const selected = queue.find((s) => s.id === selectedId) ?? queue[0] ?? null;
  const index = selected ? queue.indexOf(selected) : -1;
  const pointOf = (s) => drafts[s.id] ?? startPoint(s, zones ?? [], depot);

  const pins = queue
    .map((s) => {
      const p = pointOf(s);
      if (!p) return null;
      const isSel = s.id === selected?.id;
      return {
        id: s.id,
        lat: p.lat,
        lng: p.lng,
        color: isSel ? colors.primary : tones.warning.fg,
        label: String(queue.indexOf(s) + 1), // el elegido se distingue por ser más grande y morado
        draggable: isSel,
        title: `${s.orderNumber ?? s.id} · ${s.customer?.name ?? ''}`,
      };
    })
    .filter(Boolean);

  const goNext = () => {
    if (queue.length < 2) return;
    setSelectedId(queue[(index + 1) % queue.length].id);
  };

  const confirm = async () => {
    const point = pointOf(selected);
    if (!point) return setError('Ubique el pin en el mapa antes de confirmar.');
    setSaving(true);
    setError(null);
    const next = queue.length > 1 ? queue[(index + 1) % queue.length].id : null;
    try {
      await confirmLocation(selected.id, point, LOCATION_SOURCE.DESPACHO);
      setDrafts((d) => {
        const { [selected.id]: _done, ...rest } = d;
        return rest;
      });
      setSelectedId(next);
    } catch (err) {
      setError(err?.message || 'No se pudo confirmar la ubicación. Intente de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const map = (
    <DispatchMap
      pins={pins}
      selectedId={selected?.id}
      onPinPress={setSelectedId}
      onPinDragEnd={(id, p) => setDrafts((d) => ({ ...d, [id]: p }))}
      style={wide ? styles.mapWide : styles.mapNarrow}
    />
  );

  const list = (
    <View style={styles.list} accessibilityRole="list">
      {queue.map((s) => (
        <QueueItem key={s.id} s={s} selected={s.id === selected?.id} onPress={() => setSelectedId(s.id)} />
      ))}
    </View>
  );

  let body;
  if (loading) body = <ReviewSkeleton wide={wide} />;
  else if (!queue.length)
    body = (
      <View style={[styles.card, styles.done]}>
        <Icon name="check_circle" size={40} color={tones.success.accent} />
        <Text style={styles.cardName} accessibilityRole="header">
          Todas las direcciones están revisadas
        </Text>
        <Button title="Volver al despacho" onPress={() => router.replace('/despacho')} />
      </View>
    );
  else if (wide)
    body = (
      <View style={styles.columns}>
        <View style={styles.side}>
          <SelectedCard
            s={selected}
            moved={!!drafts[selected.id]}
            saving={saving}
            onConfirm={confirm}
            onNext={goNext}
            remaining={queue.length}
            hasNext={queue.length > 1}
          />
          <ScrollView style={styles.sideList}>{list}</ScrollView>
        </View>
        <View style={styles.mapCol}>{map}</View>
      </View>
    );
  else
    body = (
      <>
        {map}
        <SelectedCard
          s={selected}
          moved={!!drafts[selected.id]}
          saving={saving}
          onConfirm={confirm}
          onNext={goNext}
          remaining={queue.length}
          hasNext={queue.length > 1}
        />
        {list}
      </>
    );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, wide && styles.contentWide]}>
      <Header onBack={goBack} date={date} count={loading ? null : queue.length} />
      <DateSelector />
      <ErrorBanner message={error} />
      {body}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl },
  contentWide: { padding: spacing.xxl, width: '100%', maxWidth: 1280, alignSelf: 'center' },
  header: { gap: spacing.xs },
  back: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 44, alignSelf: 'flex-start' },
  backPressed: { opacity: 0.7 },
  backText: { ...typography.label, color: colors.primary },
  title: { ...typography.headline, color: colors.onSurface },
  subtitle: { ...typography.body, color: colors.onSurfaceVariant },
  subtitleRow: { flexDirection: 'row', alignItems: 'center' },
  columns: { flexDirection: 'row', gap: spacing.lg, alignItems: 'stretch' },
  side: { width: 400, gap: spacing.md },
  sideList: { maxHeight: 420 },
  mapCol: { flex: 1 },
  mapWide: { height: 640 },
  // A 360 px el botón Confirmar queda más cerca del mapa
  mapNarrow: { height: 280 },
  list: { gap: spacing.sm },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 64,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  itemSelected: { borderColor: colors.primary, backgroundColor: colors.primaryContainer },
  itemPressed: { backgroundColor: colors.surfaceContainer },
  itemText: { flex: 1, minWidth: 0, paddingVertical: spacing.sm },
  itemCode: { ...typography.code, color: colors.onSurfaceVariant },
  itemName: { ...typography.bodyStrong, color: colors.onSurface },
  itemAddress: { ...typography.caption, color: colors.onSurfaceVariant },
  itemTag: {
    ...typography.captionStrong,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  remaining: { ...typography.captionStrong, color: tones.warning.fg },
  cardName: { ...typography.title, color: colors.onSurface },
  cardAddress: { ...typography.body, color: colors.onSurface },
  reference: { padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceContainer },
  referenceLabel: { ...typography.caption, color: colors.onSurfaceVariant },
  referenceText: { ...typography.bodyStrong, color: colors.onSurface },
  reasonRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 32 },
  reasonDot: { width: 10, height: 10, borderRadius: radius.full, backgroundColor: tones.warning.accent },
  reason: { ...typography.bodyStrong, color: tones.warning.fg },
  reasonMore: { ...typography.label, color: colors.primary, marginLeft: 'auto' },
  detail: { ...typography.body, color: colors.onSurfaceVariant },
  help: { ...typography.caption, color: colors.onSurfaceVariant },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  grow: { flexGrow: 1 },
  done: { alignItems: 'center', paddingVertical: spacing.xxl },
});
