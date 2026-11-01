// app/entrega/[id].js (dueño: P3) — Confirmar entrega
// Resumen de artículos, foto, firma y descripción obligatorias; guarda con changeStatus (P1).
// Tarjetas blancas, IconTile por categoría de SKU, evidencia vacía en recuadro punteado
// y chips de lo que falta.
// El formulario guarda un borrador por envío y lo borra al completar (N26).
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { Icon } from '../../src/components/Icon';
import { IconTile } from '../../src/components/IconTile';
import { STATUS } from '../../src/constants';
import { DescriptionField, isDescriptionValid } from '../../src/features/driver/DescriptionField';
import { EmptyState } from '../../src/features/driver/EmptyState';
import { ErrorBanner } from '../../src/features/driver/ErrorBanner';
import { EvidenceSkeleton } from '../../src/features/driver/LoadingSkeletons';
import { NotDeliverable } from '../../src/features/driver/NotDeliverable';
import { PhotoCapture } from '../../src/features/driver/PhotoCapture';
import { ScreenHeader } from '../../src/features/driver/ScreenHeader';
import { SignaturePad } from '../../src/features/driver/SignaturePad';
import { SubmitBar } from '../../src/features/driver/SubmitBar';
import { useEvidenceDraft } from '../../src/features/driver/useEvidenceDraft';
import { useKeyboardInset } from '../../src/features/driver/useKeyboardInset';
import { useShipment } from '../../src/features/driver/useShipment';
import { changeStatus } from '../../src/features/shipments/statusMachine';
import { useAppStore } from '../../src/store/useAppStore';
import { colors, spacing, typography } from '../../src/theme';

const TITLE = 'Confirmar entrega';

// IconTile por categoría de SKU (prefijo antes del guion)
const CATEGORY = {
  ELE: { icon: 'tv', tone: 'info' },
  HOG: { icon: 'kitchen', tone: 'warning' },
  MUE: { icon: 'chair', tone: 'tertiary' },
};
const OTHER = { icon: 'inventory_2', tone: 'neutral' };
const categoryOf = (sku = '') => CATEGORY[sku.split('-')[0]] ?? OTHER;

function ItemsSummary({ items }) {
  const units = items.reduce((sum, it) => sum + (it.qty ?? 1), 0);
  return (
    <Card variant="elevated">
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Resumen de artículos</Text>
        <Text style={styles.sectionCount}>
          {units} {units === 1 ? 'unidad' : 'unidades'}
        </Text>
      </View>
      <View style={styles.items}>
        {items.map((item, i) => {
          const c = categoryOf(item.sku);
          return (
            <View key={`${item.sku}-${i}`} style={styles.item}>
              <IconTile icon={c.icon} tone={c.tone} size={44} />
              <View style={styles.itemText}>
                <Text style={styles.itemName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.itemMeta}>
                  {item.sku} · {item.weightKg} kg
                </Text>
              </View>
              <Text style={styles.qty}>×{item.qty}</Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

function DeliveryForm({ shipment, onBack, onDone, onFail, keyboardOpen }) {
  const driverId = useAppStore((s) => s.currentDriverId);
  const [draft, update, clearDraft] = useEvidenceDraft(`entrega:${shipment.id}`, {
    photoUri: null,
    signatureBase64: null,
    description: '',
  });
  const { photoUri, signatureBase64, description } = draft;
  const [signing, setSigning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const savingRef = useRef(false); // evita dobles toques antes de que React repinte
  const scrollRef = useRef(null);
  // La descripción es el último campo: al enfocarla se baja hasta ella (queda sobre el teclado)
  const scrollToDescription = () => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 250);

  if (done) {
    return (
      <EmptyState
        icon="check_circle"
        tone="success"
        large
        title="Entrega completada"
        body={`El pedido ${shipment.code} fue entregado a ${shipment.customer?.name ?? 'su cliente'}. El Centro de despacho ya lo ve.`}
      >
        <View style={styles.saved}>
          {['Foto', 'Firma', 'Descripción'].map((label) => (
            <View key={label} style={styles.savedItem}>
              <Icon name="check_circle" size={18} color={colors.success} />
              <Text style={styles.savedText}>{label}</Text>
            </View>
          ))}
        </View>
        <Button title="Siguiente parada" iconRight="arrow_forward" onPress={onDone} style={styles.next} />
      </EmptyState>
    );
  }

  const descriptionOk = isDescriptionValid(description);
  const checks = [
    { label: 'Foto', done: !!photoUri },
    { label: 'Firma', done: !!signatureBase64 },
    { label: 'Descripción', done: descriptionOk },
  ];
  const missing = checks.filter((c) => !c.done).map((c) => c.label.toLowerCase());

  const submit = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await changeStatus({
        shipment,
        to: STATUS.ENTREGADO,
        payload: { photoUri, signatureBase64, description },
        driverId,
      });
      clearDraft();
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <>
      <ScreenHeader title={TITLE} shipment={shipment} onBack={onBack} />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        scrollEnabled={!signing}
        keyboardShouldPersistTaps="handled"
      >
        <ItemsSummary items={shipment.items ?? []} />
        <PhotoCapture step={1} uri={photoUri} onChange={(uri) => update({ photoUri: uri })} />
        <SignaturePad
          step={2}
          value={signatureBase64}
          onChange={(sig) => update({ signatureBase64: sig })}
          onActiveChange={setSigning}
        />
        <DescriptionField
          step={3}
          value={description}
          onChange={(text) => update({ description: text })}
          onFocus={scrollToDescription}
          placeholder="Ej.: Recibió el hermano de la clienta en el portón"
        />
        <ErrorBanner message={error} />
      </ScrollView>
      <SubmitBar
        keyboardOpen={keyboardOpen}
        title="Completar entrega"
        missing={missing}
        saving={saving}
        onSubmit={submit}
      >
        <Button title="No se pudo entregar" variant="text" size="md" disabled={saving} onPress={onFail} />
      </SubmitBar>
    </>
  );
}

export default function ConfirmarEntrega() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { shipment, error, retry } = useShipment(id);
  const { ref: screenRef, inset } = useKeyboardInset();

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/motorista'));
  const goToDriver = () => router.replace('/motorista');

  let body;
  if (error)
    body = (
      <>
        <ScreenHeader title={TITLE} onBack={goBack} />
        <View style={styles.padded}>
          <ErrorBanner message={error} onRetry={retry} />
        </View>
      </>
    );
  else if (shipment === undefined)
    body = (
      <>
        <ScreenHeader title={TITLE} onBack={goBack} />
        <View style={styles.padded}>
          <EvidenceSkeleton />
        </View>
      </>
    );
  else if (shipment?.status !== STATUS.EN_RUTA)
    body = (
      <>
        <ScreenHeader title={TITLE} shipment={shipment} onBack={goBack} />
        <NotDeliverable shipment={shipment} id={id} onGoToDriver={goToDriver} />
      </>
    );
  else
    body = (
      <DeliveryForm
        key={shipment.id}
        keyboardOpen={inset > 0}
        shipment={shipment}
        onBack={goBack}
        onDone={goToDriver}
        onFail={() => router.push(`/entrega/no-entregado/${shipment.id}`)}
      />
    );

  return (
    <View ref={screenRef} style={[styles.screen, { paddingBottom: inset }]}>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  padded: { paddingHorizontal: spacing.lg },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.lg, gap: spacing.lg },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionTitle: { ...typography.titleSmall, color: colors.onSurface },
  sectionCount: { ...typography.caption, color: colors.onSurfaceVariant },
  items: { gap: spacing.md },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  itemText: { flex: 1, minWidth: 0 },
  itemName: { ...typography.bodyStrong, color: colors.onSurface },
  itemMeta: { ...typography.code, color: colors.onSurfaceVariant, marginTop: 2 },
  qty: { ...typography.bodyStrong, fontFamily: typography.fonts.bold, color: colors.onSurface },
  // Resumen de lo guardado en la pantalla de éxito
  saved: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.lg },
  savedItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  savedText: { ...typography.label, color: colors.onSurfaceVariant },
  next: { alignSelf: 'stretch', marginTop: spacing.sm },
});
