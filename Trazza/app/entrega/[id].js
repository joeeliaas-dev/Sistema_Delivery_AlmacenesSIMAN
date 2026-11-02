// app/entrega/[id].js (dueño: P3) — Confirmar entrega
// Resumen de artículos, foto, firma y descripción obligatorias; guarda con changeStatus (P1).
// Sin señal: la entrega se guarda en el teléfono (queueStatusChange de P1) y se envía sola después.
// Rediseño (30 oct): artículos en lista simple (sin íconos de categoría), pasos foto → firma → nota
// con un check al completarse, y "Completar entrega" bloqueado con lo que falta ("Falta la firma").
// El formulario guarda un borrador por envío y lo borra al completar (N26).
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { STATUS } from '../../src/constants';
import { DescriptionField, isDescriptionValid } from '../../src/features/driver/DescriptionField';
import { EmptyState } from '../../src/features/driver/EmptyState';
import { ErrorBanner } from '../../src/features/driver/ErrorBanner';
import { confirmFromDelivery } from '../../src/features/driver/gpsCorrection';
import { EvidenceSkeleton } from '../../src/features/driver/LoadingSkeletons';
import { NotDeliverable } from '../../src/features/driver/NotDeliverable';
import { PhotoCapture } from '../../src/features/driver/PhotoCapture';
import { ScreenHeader } from '../../src/features/driver/ScreenHeader';
import { SignaturePad } from '../../src/features/driver/SignaturePad';
import { useOnline } from '../../src/features/driver/OutboxBanner';
import { sendOrQueue } from '../../src/features/driver/sendOrQueue';
import { SubmitBar } from '../../src/features/driver/SubmitBar';
import { useEvidenceDraft } from '../../src/features/driver/useEvidenceDraft';
import { useKeyboardInset } from '../../src/features/driver/useKeyboardInset';
import { useShipment } from '../../src/features/driver/useShipment';
import { changeStatus } from '../../src/features/shipments/statusMachine';
import { useCurrentDriverId } from '../../src/features/driver/useDriverRoute';
import { colors, spacing, typography } from '../../src/theme';

const TITLE = 'Confirmar entrega';

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
          return (
            <View key={`${item.sku}-${i}`} style={styles.item}>
              <View style={styles.itemText}>
                <Text style={styles.itemName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.itemMeta}>{item.sku}</Text>
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
  const driverId = useCurrentDriverId();
  const online = useOnline();
  const [draft, update, clearDraft] = useEvidenceDraft(`entrega:${shipment.id}`, {
    photoUri: null,
    signatureBase64: null,
    description: '',
  });
  const { photoUri, signatureBase64, description } = draft;
  const [signing, setSigning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null); // 'enviada' | 'guardada' (sin señal, en el teléfono)
  const savingRef = useRef(false); // evita dobles toques antes de que React repinte
  const scrollRef = useRef(null);
  // La descripción es el último campo: al enfocarla se baja hasta ella (queda sobre el teclado)
  const scrollToDescription = () => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 250);

  if (done) {
    const offline = done === 'guardada';
    return (
      <EmptyState
        icon={offline ? 'cloud_off' : 'check_circle'}
        tone={offline ? 'warning' : 'success'}
        large
        title={offline ? 'Entrega guardada en el teléfono' : 'Entrega completada'}
        body={
          offline
            ? `${shipment.code} · se envía sola cuando vuelva la señal`
            : [shipment.code, shipment.customer?.name].filter(Boolean).join(' · ')
        }
      >
        <Button title="Siguiente parada" onPress={onDone} style={styles.next} />
      </EmptyState>
    );
  }

  const descriptionOk = isDescriptionValid(description);
  const checks = [
    { label: 'la foto', done: !!photoUri },
    { label: 'la firma', done: !!signatureBase64 },
    { label: 'la nota', done: descriptionOk },
  ];
  const missing = checks.filter((c) => !c.done).map((c) => c.label);

  const submit = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    const payload = { photoUri, signatureBase64, description };
    try {
      const { queued, result } = await sendOrQueue({
        online,
        send: () => changeStatus({ shipment, to: STATUS.ENTREGADO, payload, driverId }),
        change: { shipmentId: shipment.id, code: shipment.code, to: STATUS.ENTREGADO, payload, driverId },
      });
      clearDraft();
      // S4-14: con GPS preciso, la casa del cliente queda confirmada en el pedido (sin esperar ni avisar)
      if (!queued) confirmFromDelivery(shipment, result?.gps);
      setDone(queued ? 'guardada' : 'enviada');
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
          placeholder="Ej.: recibió la clienta en la puerta"
        />
        <ErrorBanner message={error} />
      </ScrollView>
      <SubmitBar
        keyboardOpen={keyboardOpen}
        title="Completar entrega"
        icon={null}
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
  // En escritorio, una columna de 640 px centrada (como el motorista)
  content: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.lg,
    gap: spacing.lg,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionTitle: { ...typography.titleSmall, color: colors.onSurface },
  sectionCount: { ...typography.caption, color: colors.onSurfaceVariant },
  items: { gap: spacing.sm },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 40 },
  itemText: { flex: 1, minWidth: 0 },
  itemName: { ...typography.bodyStrong, color: colors.onSurface },
  itemMeta: { ...typography.code, color: colors.onSurfaceVariant, marginTop: 2 },
  qty: { ...typography.number, color: colors.onSurface },
  next: { alignSelf: 'stretch', marginTop: spacing.sm },
});
