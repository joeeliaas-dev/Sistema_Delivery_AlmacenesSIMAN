// src/features/drivers/PanelSheet.js (dueño: P3)
// Contenedor de los paneles de Motoristas ("Agregar motorista", "Darle acceso a la app"): en
// teléfono sube como hoja desde abajo (igual que "Pasar a…" del despacho), en escritorio es un panel
// a la derecha. Se cierra con la X o tocando afuera. Con el teclado abierto en el teléfono (web) la
// hoja sube lo que tapa el teclado, para que "Guardar" quede a la vista.
// También las piezas comunes: encabezado con X, campo con su error y aviso de éxito.
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Icon } from '../../components/Icon';
import { colors, radius, spacing, tones, typography } from '../../theme';

// Teléfono en la web: cuánto tapa el teclado (visualViewport). En Android/iOS nativo lo hace
// KeyboardAvoidingView.
function useKeyboardInset() {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.visualViewport) return undefined;
    const vv = window.visualViewport;
    const update = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
  return inset;
}

// scrollRef (opcional): el formulario sube el panel hasta un campo con error que quedó fuera de la vista
export function PanelSheet({ open, wide, onClose, scrollRef, children }) {
  const { height } = useWindowDimensions();
  const inset = useKeyboardInset();
  return (
    <Modal visible={open} transparent animationType={wide ? 'fade' : 'slide'} onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.wrap, wide && styles.wrapWide]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* El fondo cierra al tocarlo; para el lector de pantalla queda la X ("Cerrar") */}
        <Pressable style={styles.backdrop} onPress={onClose} accessible={false} aria-hidden />
        <View
          style={
            wide ? styles.side : [styles.sheet, { marginBottom: inset, maxHeight: Math.round((height - inset) * 0.9) }]
          }
          accessibilityViewIsModal
        >
          <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function SheetHead({ title, onClose }) {
  return (
    <View style={styles.head}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Cerrar"
        style={({ pressed }) => [styles.close, pressed && panelStyles.pressed]}
      >
        <Icon name="close" size={22} color={colors.onSurfaceVariant} />
      </Pressable>
    </View>
  );
}

export function Field({ label, error, children }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {error ? (
        <Text style={styles.fieldError} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export function Notice({ text }) {
  return (
    <View style={styles.notice} accessibilityLiveRegion="polite">
      <Icon name="check_circle" size={20} color={tones.success.accent} />
      <Text style={styles.noticeText}>{text}</Text>
    </View>
  );
}

// Estilos que comparten los formularios de los paneles
export const panelStyles = StyleSheet.create({
  body: { gap: spacing.lg },
  flex: { flex: 1, minWidth: 0 },
  pressed: { backgroundColor: colors.surfaceContainer },
  input: {
    ...typography.bodyLarge,
    ...Platform.select({ web: { fontSize: 16, outlineStyle: 'none' } }),
    height: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.white,
    color: colors.onSurface,
  },
  inputError: { borderColor: tones.error.accent, borderWidth: 2 },
  actions: { gap: spacing.sm },
});

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'flex-end' },
  wrapWide: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'stretch' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.shadow, opacity: 0.32 },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
  },
  side: { width: 440, maxWidth: '100%', backgroundColor: colors.white },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  title: { ...typography.headline, color: colors.onSurface, flexShrink: 1 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
  field: { gap: spacing.xs },
  label: { ...typography.label, color: colors.onSurface },
  fieldError: { ...typography.captionStrong, color: tones.error.fg },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: tones.success.bg,
  },
  noticeText: { ...typography.bodyStrong, color: tones.success.fg, flex: 1 },
});
