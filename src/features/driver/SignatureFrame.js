// src/features/driver/SignatureFrame.js (dueño: P3)
// Marco común de la firma (título, Limpiar, recuadro, guía y línea punteada).
// Vacía: recuadro punteado blanco con ícono y texto. Firmada: borde normal; el paso pasa a verde.
// El lienzo cambia por plataforma: SignaturePad.js (WebView) y SignaturePad.web.js (<canvas>).
import { StyleSheet, View } from 'react-native';
import { Button } from '../../components/Button';
import { colors, radius, spacing } from '../../theme';
import { EmptyEvidence } from './EvidenceParts';
import { SectionLabel } from './SectionLabel';

export const SIGNATURE_HEIGHT = 160;
export const PEN_COLOR = colors.onPrimaryContainer;
export const PAD_BACKGROUND = colors.white;

export function SignatureFrame({ hasSignature, onClear, step, children }) {
  return (
    <View>
      <SectionLabel
        step={step}
        done={hasSignature}
        right={hasSignature ? <Button title="Limpiar" variant="text" size="sm" onPress={onClear} /> : null}
      >
        Firma del cliente
      </SectionLabel>
      <View style={[styles.box, hasSignature ? styles.boxSigned : styles.boxEmpty]}>
        {children}
        {!hasSignature ? (
          <View pointerEvents="none" style={styles.hint}>
            <EmptyEvidence icon="draw" label="Firme dentro del recuadro" />
          </View>
        ) : null}
        <View pointerEvents="none" style={styles.baseline} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    height: SIGNATURE_HEIGHT,
    borderRadius: radius.lg,
    backgroundColor: PAD_BACKGROUND,
    overflow: 'hidden',
  },
  boxEmpty: { borderWidth: 2, borderStyle: 'dashed', borderColor: colors.cardBorder },
  boxSigned: { borderWidth: 1, borderColor: colors.cardBorder },
  hint: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  baseline: {
    position: 'absolute',
    left: spacing.xxl,
    right: spacing.xxl,
    bottom: spacing.xl,
    borderBottomWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.outlineVariant,
  },
});

export default SignatureFrame;
