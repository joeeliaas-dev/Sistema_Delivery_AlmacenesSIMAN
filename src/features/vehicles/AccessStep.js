// src/features/vehicles/AccessStep.js (dueño: P3)
// Paso "Darle acceso a la app" (C48): correo y contraseña inicial (mínimo 8, con mostrar/ocultar).
// Llama a createDriverAccess de P1; la sesión del despacho no cambia. Su error (en español) va junto
// al campo, o debajo del botón si no es de un campo. Al terminar: "Ana ya puede entrar con …".
// Se usa al final de "Agregar motorista" y desde "Dar acceso" en la tarjeta del motorista.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { createDriverAccess } from '../../lib/auth';
import { colors, radius, tones, typography } from '../../theme';
import { markAccess } from '../session/accountsStub';
import { accessFieldOf } from './fleetMath';
import { Field, Notice, panelStyles, SheetHead } from './PanelSheet';

/**
 * @param {{ driver: { id: string, name: string }, intro?: string, onClose: () => void,
 *   onFieldError?: () => void }} props  intro: aviso de arriba (p. ej. "Ana Pérez agregado")
 */
export function AccessStep({ driver, intro, onClose, onFieldError }) {
  const first = driver.name.split(' ')[0];
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null); // { field, message }
  const [done, setDone] = useState(null); // correo con el que ya puede entrar

  const give = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const { uid, email: saved } = await createDriverAccess({
        driverId: driver.id,
        name: driver.name,
        email,
        password,
      });
      markAccess(uid, true);
      setDone(saved);
    } catch (err) {
      const message = err?.message || 'No se pudo dar el acceso. Intente de nuevo.';
      const field = accessFieldOf(message);
      setError({ field, message });
      if (field) onFieldError?.();
    } finally {
      setSaving(false);
    }
  };
  const errorFor = (field) => (error?.field === field ? error.message : null);

  if (done)
    return (
      <View style={panelStyles.body}>
        <SheetHead title="Acceso listo" onClose={onClose} />
        <Notice text={`${first} ya puede entrar con ${done} y la contraseña que le diste.`} />
        <View style={panelStyles.actions}>
          <Button title="Listo" onPress={onClose} />
        </View>
      </View>
    );

  return (
    <View style={panelStyles.body}>
      <SheetHead title="Darle acceso a la app" onClose={onClose} />
      {intro ? <Notice text={intro} /> : null}
      <Text style={styles.lead}>
        {first} entra con este correo y esta contraseña. Désela en persona; puede cambiarla después.
      </Text>
      <Field label="Correo" error={errorFor('email')}>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="nombre@empresa.com"
          placeholderTextColor={colors.placeholder}
          keyboardType="email-address"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          accessibilityLabel={`Correo de ${first}`}
          style={[panelStyles.input, errorFor('email') && panelStyles.inputError]}
        />
      </Field>
      <Field label="Contraseña inicial" error={errorFor('password')}>
        <View style={[styles.passwordBox, errorFor('password') && panelStyles.inputError]}>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!show}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            textContentType="newPassword"
            onSubmitEditing={give}
            accessibilityLabel={`Contraseña inicial de ${first}`}
            style={[panelStyles.input, styles.passwordInput]}
          />
          <Pressable
            onPress={() => setShow(!show)}
            accessibilityRole="button"
            accessibilityLabel={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            style={({ pressed }) => [styles.eye, pressed && panelStyles.pressed]}
          >
            <Icon name={show ? 'visibility_off' : 'visibility'} size={22} color={colors.onSurfaceVariant} />
          </Pressable>
        </View>
        {!errorFor('password') ? <Text style={styles.hint}>Mínimo 8 caracteres</Text> : null}
      </Field>
      {error && !error.field ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error.message}
        </Text>
      ) : null}
      <View style={panelStyles.actions}>
        <Button
          title={saving ? 'Dando acceso…' : 'Dar acceso'}
          disabled={saving}
          onPress={give}
          accessibilityLabel={`Dar acceso a ${driver.name}`}
        />
        <Button title="Ahora no" variant="text" size="md" onPress={onClose} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  lead: { ...typography.body, color: colors.onSurfaceVariant },
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
  hint: { ...typography.caption, color: colors.onSurfaceVariant },
  error: { ...typography.captionStrong, color: tones.error.fg },
});

export default AccessStep;
