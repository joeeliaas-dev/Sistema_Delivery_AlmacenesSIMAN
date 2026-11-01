// app/login.js (dueño: P3) — Pantalla de entrada
// Correo y contraseña (decisión de Andrés). La sesión, las cuentas y la protección de pantallas son
// de P1 (src/lib/auth.js y app/_layout.js): esta pantalla solo llama a signIn, y _layout lleva a
// cada rol a su vista. Errores: vacío o correo mal escrito debajo de su campo; el de signIn debajo del botón.
// Enter envía. A 360 px el formulario va arriba, para que el teclado abierto no tape "Entrar".
// En modo datos de prueba (USE_MOCKS), "Entrar como…" con las cuentas de prueba, sin escribir.
import { useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Button } from '../src/components/Button';
import { Icon } from '../src/components/Icon';
import { loginFieldErrors } from '../src/features/session/loginMath';
import { DEMO_ACCOUNTS, DEMO_PASSWORD, ROLE, signIn } from '../src/lib/auth';
import { USE_MOCKS } from '../src/lib/firebase';
import { colors, radius, spacing, tones, typography } from '../src/theme';

const WIDE = 760;

function Field({ label, error, children }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export default function Entrar() {
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(null); // 'form' o la key de la cuenta de prueba
  const passwordRef = useRef(null);

  const enter = async (mail, pass, who) => {
    setFormError(null);
    setBusy(who);
    try {
      await signIn(mail.trim(), pass); // con la sesión abierta, _layout (P1) lleva a su vista
    } catch (err) {
      setFormError(err?.message || 'No se pudo entrar. Intente de nuevo.');
      setBusy(null);
    }
  };

  const submit = () => {
    if (busy) return;
    const errors = loginFieldErrors(email, password);
    setFieldErrors(errors);
    if (errors.email || errors.password) return;
    enter(email, password, 'form');
  };

  const demo = (account) => {
    if (busy) return;
    setFieldErrors({});
    enter(account.email, DEMO_PASSWORD, account.key);
  };

  const dispatcher = DEMO_ACCOUNTS.find((a) => a.role === ROLE.DESPACHO);
  const riders = DEMO_ACCOUNTS.filter((a) => a.role === ROLE.MOTORISTA);

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, wide && styles.contentWide]}
      >
        <View style={[styles.column, wide && styles.card]}>
          <View style={styles.brand}>
            <Image source={require('../assets/splash-small.png')} style={styles.logo} accessibilityLabel="Trazza" />
            <Text style={styles.title} accessibilityRole="header">
              Entrar a Trazza
            </Text>
          </View>

          <Field label="Correo" error={fieldErrors.email}>
            <TextInput
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                if (fieldErrors.email) setFieldErrors((f) => ({ ...f, email: undefined }));
              }}
              placeholder="nombre@empresa.com"
              placeholderTextColor={colors.placeholder}
              keyboardType="email-address"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="username"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              blurOnSubmit={false}
              editable={!busy}
              accessibilityLabel="Correo"
              style={[styles.input, fieldErrors.email && styles.inputError]}
            />
          </Field>

          <Field label="Contraseña" error={fieldErrors.password}>
            <View style={[styles.passwordBox, fieldErrors.password && styles.inputError]}>
              <TextInput
                ref={passwordRef}
                value={password}
                onChangeText={(t) => {
                  setPassword(t);
                  if (fieldErrors.password) setFieldErrors((f) => ({ ...f, password: undefined }));
                }}
                secureTextEntry={!show}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="current-password"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={submit}
                editable={!busy}
                accessibilityLabel="Contraseña"
                style={[styles.input, styles.passwordInput]}
              />
              <Pressable
                onPress={() => setShow(!show)}
                accessibilityRole="button"
                accessibilityLabel={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                style={({ pressed }) => [styles.eye, pressed && styles.pressed]}
              >
                <Icon name={show ? 'visibility_off' : 'visibility'} size={22} color={colors.onSurfaceVariant} />
              </Pressable>
            </View>
          </Field>

          <View style={styles.actions}>
            <Button title={busy === 'form' ? 'Entrando…' : 'Entrar'} disabled={!!busy} onPress={submit} />
            {formError ? (
              <View style={styles.formError} accessibilityLiveRegion="assertive">
                <Icon name="error_outline" size={18} color={tones.error.fg} />
                <Text style={styles.formErrorText}>{formError}</Text>
              </View>
            ) : null}
          </View>

          {USE_MOCKS ? (
            <View style={styles.demo}>
              <Text style={styles.demoTitle}>Datos de prueba</Text>
              <Button
                title={busy === dispatcher.key ? 'Entrando…' : 'Entrar como despachador'}
                variant="secondary"
                disabled={!!busy}
                onPress={() => demo(dispatcher)}
              />
              <Text style={styles.demoCaption}>Entrar como motorista</Text>
              <View style={styles.riders}>
                {riders.map((a) => (
                  <Pressable
                    key={a.key}
                    onPress={() => demo(a)}
                    disabled={!!busy}
                    accessibilityRole="button"
                    accessibilityLabel={`Entrar como ${a.name.split(' ')[0]}`}
                    style={({ pressed }) => [styles.rider, pressed && styles.pressed, busy && styles.dim]}
                  >
                    <Text style={styles.riderText}>{busy === a.key ? 'Entrando…' : a.name.split(' ')[0]}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, padding: spacing.lg, paddingBottom: spacing.xxxl },
  contentWide: { justifyContent: 'center', alignItems: 'center', paddingVertical: spacing.xxxl },
  column: { width: '100%', maxWidth: 400, alignSelf: 'center', gap: spacing.lg },
  card: {
    padding: spacing.xxl,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.lg,
  },
  brand: { alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  logo: { width: 56, height: 56 },
  title: { ...typography.headline, color: colors.onSurface },
  field: { gap: spacing.xs },
  label: { ...typography.label, color: colors.onSurface },
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
  passwordBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.white,
  },
  passwordInput: { flex: 1, minWidth: 0, borderWidth: 0, height: 46 },
  eye: { width: 48, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
  pressed: { backgroundColor: colors.surfaceContainer },
  error: { ...typography.captionStrong, color: tones.error.fg },
  actions: { gap: spacing.sm, marginTop: spacing.xs },
  formError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: tones.error.bg,
  },
  formErrorText: { ...typography.bodyStrong, color: tones.error.fg, flex: 1 },
  demo: {
    gap: spacing.sm,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  demoTitle: { ...typography.label, color: colors.onSurfaceVariant },
  demoCaption: { ...typography.caption, color: colors.onSurfaceVariant, marginTop: spacing.xs },
  riders: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  rider: {
    minHeight: 44,
    minWidth: 72,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.white,
  },
  dim: { opacity: 0.6 },
  riderText: { ...typography.label, color: colors.onSurface },
});
