// app/entrega/no-entregado/[id].js (dueño: P3) — No se pudo entregar
// Motivo de FAIL_REASONS, foto y descripción. changeStatus (P1) decide si queda no_entregado
// (se programa el reintento) o pasa solo a devuelto en el 2.º fallo.
// Tarjetas blancas y chips de lo que falta.
// El formulario guarda un borrador por envío y lo borra al registrar (N26).
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../../src/components/Button';
import { IconTile } from '../../../src/components/IconTile';
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
import { useAppStore } from '../../../src/store/useAppStore';
import { colors, radius, spacing, tones, typography } from '../../../src/theme';

const TITLE = 'No se pudo entregar';

// Mensaje según el status que devuelve changeStatus
const RESULTS = {
  [STATUS.NO_ENTREGADO]: {
    icon: 'replay',
    tone: 'warning',
    title: 'Se programó un reintento',
    body: (s) => `El pedido ${s.code} se intentará entregar de nuevo en una próxima ruta.`,
  },
  [STATUS.DEVUELTO]: {
    icon: 'assignment_return',
    tone: 'neutral',
    title: 'El envío vuelve a bodega',
    body: (s) => `El pedido ${s.code} no se pudo entregar en el reintento y regresa al depósito.`,
  },
};

function FailureForm({ shipment, onBack, onDone, keyboardOpen }) {
  const driverId = useAppStore((s) => s.currentDriverId);
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
        <Button title="Siguiente parada" iconRight="arrow_forward" onPress={onDone} style={styles.next} />
      </EmptyState>
    );
  }

  const isRetry = shipment.attempts + 1 >= MAX_ATTEMPTS;
  const checks = [
    { label: 'Motivo', done: !!reason },
    { label: 'Foto', done: !!photoUri },
    { label: 'Descripción', done: isDescriptionValid(description) },
  ];
  const missing = checks.filter((c) => !c.done).map((c) => c.label.toLowerCase());

  const submit = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const { status } = await changeStatus({
        shipment,
        to: STATUS.NO_ENTREGADO,
        payload: { reason, photoUri, description },
        driverId,
      });
      clearDraft();
      setResultStatus(status);
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
            <IconTile icon="warning_amber" tone="warning" size={36} />
            <Text style={styles.noticeText}>Este es el reintento. Si no se entrega, el envío vuelve a bodega.</Text>
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
        icon="report"
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
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.lg, gap: spacing.lg },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: tones.warning.bg,
  },
  noticeText: { ...typography.bodyStrong, color: tones.warning.fg, flex: 1 },
  next: { alignSelf: 'stretch' },
});
