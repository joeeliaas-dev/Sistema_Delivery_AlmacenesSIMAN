// app/entrega/no-entregado/[id].js (dueño: P3) — No se pudo entregar
// Sin señal: se guarda en el teléfono (queueStatusChange de P1) y se envía sola después.
// Motivo de FAIL_REASONS, foto y descripción. changeStatus (P1) decide si queda no_entregado
// (se programa el reintento) o pasa solo a devuelto en el 2.º fallo.
// Tarjetas blancas y chips de lo que falta.
// El formulario guarda un borrador por envío y lo borra al registrar (N26).
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../../src/components/Button';
import { MAX_ATTEMPTS, STATUS } from '../../../src/constants';
import { DescriptionField, isDescriptionValid } from '../../../src/features/driver/DescriptionField';
import { EmptyState } from '../../../src/features/driver/EmptyState';
import { ErrorBanner } from '../../../src/features/driver/ErrorBanner';
import { EvidenceSkeleton } from '../../../src/features/driver/LoadingSkeletons';
import { NotDeliverable } from '../../../src/features/driver/NotDeliverable';
import { PhotoCapture } from '../../../src/features/driver/PhotoCapture';
import { ReasonPicker } from '../../../src/features/driver/ReasonPicker';
import { ScreenHeader } from '../../../src/features/driver/ScreenHeader';
import { SubmitBar } from '../../../src/features/driver/SubmitBar';
import { useEvidenceDraft } from '../../../src/features/driver/useEvidenceDraft';
import { useKeyboardInset } from '../../../src/features/driver/useKeyboardInset';
import { useShipment } from '../../../src/features/driver/useShipment';
import { changeStatus } from '../../../src/features/shipments/statusMachine';
import { useCurrentDriverId } from '../../../src/features/driver/useDriverRoute';
import { useOnline } from '../../../src/features/driver/OutboxBanner';
import { sendOrQueue } from '../../../src/features/driver/sendOrQueue';
import { colors, radius, spacing, tones, typography } from '../../../src/theme';

const TITLE = 'No se pudo entregar';

// Mensaje según el status que devuelve changeStatus
const QUEUED = 'guardada'; // sin señal: todavía no se sabe si queda no_entregado o devuelto
const RESULTS = {
  [QUEUED]: {
    icon: 'cloud_off',
    tone: 'warning',
    title: 'No entrega guardada en el teléfono',
    body: (s) => `${s.code} · se envía sola cuando vuelva la señal`,
  },
  [STATUS.NO_ENTREGADO]: {
    icon: 'replay',
    tone: 'warning',
    title: 'Se programó un reintento',
    body: (s) => `${s.code} · se intenta otra vez en otra ruta`,
  },
  [STATUS.DEVUELTO]: {
    icon: 'assignment_return',
    tone: 'neutral',
    title: 'El envío vuelve a bodega',
    body: (s) => `${s.code} · regresa al depósito`,
  },
};

function FailureForm({ shipment, onBack, onDone, keyboardOpen }) {
  const driverId = useCurrentDriverId();
  const online = useOnline();
  const [draft, update, clearDraft] = useEvidenceDraft(`no-entregado:${shipment.id}`, {
    reason: null,
    photoUri: null,
    description: '',
  });
  const { reason, photoUri, description } = draft;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [resultStatus, setResultStatus] = useState(null);
  const savingRef = useRef(false);
  const scrollRef = useRef(null);
  // La descripción es el último campo: al enfocarla se baja hasta ella (queda sobre el teclado)
  const scrollToDescription = () => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 250);

  const result = RESULTS[resultStatus];
  if (result) {
    return (
      <EmptyState icon={result.icon} tone={result.tone} large title={result.title} body={result.body(shipment)}>
        <Button title="Siguiente parada" onPress={onDone} style={styles.next} />
      </EmptyState>
    );
  }

  const isRetry = shipment.attempts + 1 >= MAX_ATTEMPTS;
  const checks = [
    { label: 'el motivo', done: !!reason },
    { label: 'la foto', done: !!photoUri },
    { label: 'la nota', done: isDescriptionValid(description) },
  ];
  const missing = checks.filter((c) => !c.done).map((c) => c.label);

  const submit = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    const payload = { reason, photoUri, description };
    try {
      const { queued, result } = await sendOrQueue({
        online,
        send: () => changeStatus({ shipment, to: STATUS.NO_ENTREGADO, payload, driverId }),
        change: { shipmentId: shipment.id, code: shipment.code, to: STATUS.NO_ENTREGADO, payload, driverId },
      });
      clearDraft();
      setResultStatus(queued ? QUEUED : result.status);
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
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {isRetry ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>Este es el reintento: si no se entrega, vuelve a bodega.</Text>
          </View>
        ) : null}
        <ReasonPicker step={1} value={reason} onChange={(r) => update({ reason: r })} />
        <PhotoCapture step={2} uri={photoUri} onChange={(uri) => update({ photoUri: uri })} label="Foto del lugar" />
        <DescriptionField
          step={3}
          value={description}
          onChange={(text) => update({ description: text })}
          onFocus={scrollToDescription}
          placeholder="Ej.: Nadie abrió; se llamó dos veces al cliente"
        />
        <ErrorBanner message={error} />
      </ScrollView>
      <SubmitBar
        keyboardOpen={keyboardOpen}
        title="Registrar no entrega"
        icon={null}
        missing={missing}
        saving={saving}
        onSubmit={submit}
      />
    </>
  );
}

export default function NoEntregado() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { shipment, error, retry } = useShipment(id);
  const { ref: screenRef, inset } = useKeyboardInset();

  const goBack = () => (router.canGoBack() ? router.back() : router.replace(`/entrega/${id}`));
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
      <FailureForm key={shipment.id} keyboardOpen={inset > 0} shipment={shipment} onBack={goBack} onDone={goToDriver} />
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
  content: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.lg,
    gap: spacing.lg,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: tones.warning.bg,
  },
  noticeText: { ...typography.bodyStrong, color: tones.warning.fg, flex: 1 },
  next: { alignSelf: 'stretch' },
});
