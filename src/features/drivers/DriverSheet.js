// src/features/drivers/DriverSheet.js (dueño: P3)
// Panel "Agregar motorista", en PanelSheet: nombre, teléfono (opcional), zona
// y turno (C53). "Guardar" llama a createDriver de P1; su error (en español) se
// muestra junto a su campo, o debajo de "Guardar" si no es de un campo. Al guardar, en el mismo panel:
// "Darle acceso a la app" (AccessStep, createDriverAccess de P1) u "Ahora no".
// Con accessFor (un motorista que ya existe) el panel abre directo en ese paso ("Dar acceso").
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '../../components/Button';
import { DEFAULT_SHIFT } from '../../constants';
import { colors, radius, spacing, tones, typography } from '../../theme';
import { createDriver } from '../fleet/fleetService';
import { AccessStep } from './AccessStep';
import { driverFieldOf, normalizeTime } from './fleetMath';
import { Field, PanelSheet, panelStyles, SheetHead } from './PanelSheet';
import { TimeField } from './TimeField';

// Opciones grandes en filas que se acomodan (zonas)
function Options({ label, items, value, onChange }) {
  return (
    <View style={styles.options} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {items.map((it) => {
        const on = it.key === value;
        return (
          <Pressable
            key={it.key ?? 'ninguno'}
            onPress={() => onChange(it.key)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={it.label}
            style={({ pressed }) => [styles.option, on && styles.optionOn, pressed && !on && panelStyles.pressed]}
          >
            <Text style={[styles.optionText, on && styles.optionTextOn]}>{it.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function DriverForm({ zones, onClose, onSaved, onFieldError }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [zoneId, setZoneId] = useState(null);
  const [start, setStart] = useState(DEFAULT_SHIFT.START);
  const [end, setEnd] = useState(DEFAULT_SHIFT.END);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null); // { field, message }

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const id = await createDriver({
        name,
        phone: phone.trim() || null,
        zoneId,
        shiftStart: normalizeTime(start),
        shiftEnd: normalizeTime(end),
      });
      onSaved({ id, name: name.trim().replace(/\s+/g, ' ') });
    } catch (err) {
      const message = err?.message || 'No se pudo agregar el motorista. Intente de nuevo.';
      const field = driverFieldOf(message);
      setError({ field, message });
      setSaving(false);
      // Nombre, teléfono y zona van arriba: el panel sube para que se vea el error junto al campo
      if (field && field !== 'shift') onFieldError?.();
    }
  };
  const errorFor = (field) => (error?.field === field ? error.message : null);

  return (
    <View style={panelStyles.body}>
      <SheetHead title="Agregar motorista" onClose={onClose} />
      <Field label="Nombre" error={errorFor('name')}>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Ana Pérez"
          placeholderTextColor={colors.placeholder}
          autoCapitalize="words"
          autoComplete="name"
          accessibilityLabel="Nombre del motorista"
          style={[panelStyles.input, errorFor('name') && panelStyles.inputError]}
        />
      </Field>
      <Field label="Teléfono (opcional)" error={errorFor('phone')}>
        <TextInput
          value={phone}
          onChangeText={setPhone}
          placeholder="7000 0000"
          placeholderTextColor={colors.placeholder}
          inputMode="tel"
          keyboardType="phone-pad"
          autoComplete="tel"
          accessibilityLabel="Teléfono del motorista"
          style={[panelStyles.input, errorFor('phone') && panelStyles.inputError]}
        />
      </Field>
      <Field label="Zona" error={errorFor('zone')}>
        <Options
          label="Zona del motorista"
          items={zones.map((z) => ({ key: z.id, label: z.name }))}
          value={zoneId}
          onChange={setZoneId}
        />
      </Field>
      <Field label="Turno" error={errorFor('shift')}>
        <View style={styles.times}>
          <TimeField label="Inicio" value={start} onChange={setStart} onBlur={() => setStart(normalizeTime(start))} />
          <TimeField label="Fin" value={end} onChange={setEnd} onBlur={() => setEnd(normalizeTime(end))} />
        </View>
      </Field>
      {error && !error.field ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error.message}
        </Text>
      ) : null}
      <View style={panelStyles.actions}>
        <Button
          title={saving ? 'Guardando…' : 'Guardar'}
          disabled={saving}
          onPress={save}
          accessibilityLabel="Guardar motorista"
        />
        <Button title="Cancelar" variant="text" size="md" onPress={onClose} />
      </View>
    </View>
  );
}

/**
 * @param {{ open: boolean, wide: boolean, zones: object[],
 *   accessFor?: { id: string, name: string }, onClose: () => void, onSaved?: (name: string) => void }} props
 *   accessFor: abrir directo en "Darle acceso a la app" para ese motorista. onSaved: se creó el motorista.
 */
export function DriverSheet({ open, wide, zones, accessFor, onClose, onSaved }) {
  const scrollRef = useRef(null);
  const [created, setCreated] = useState(null); // { id, name } recién creado
  const toTop = () => scrollRef.current?.scrollTo({ y: 0, animated: true });
  const target = accessFor ?? created;
  return (
    <PanelSheet open={open} wide={wide} onClose={onClose} scrollRef={scrollRef}>
      {target ? (
        <AccessStep
          driver={target}
          intro={created ? `${created.name} agregado. Sale desde el próximo Optimizar día.` : null}
          onClose={onClose}
          onFieldError={toTop}
        />
      ) : (
        <DriverForm
          zones={zones}
          onClose={onClose}
          onFieldError={toTop}
          onSaved={(d) => {
            onSaved?.(d.name);
            setCreated(d);
            toTop();
          }}
        />
      )}
    </PanelSheet>
  );
}

const styles = StyleSheet.create({
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  option: {
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.white,
  },
  optionOn: { borderColor: colors.primary, borderWidth: 2, backgroundColor: colors.primaryContainer },
  optionText: { ...typography.label, color: colors.onSurface },
  optionTextOn: { color: colors.onPrimaryContainer },
  times: { flexDirection: 'row', gap: spacing.md },
  error: { ...typography.captionStrong, color: tones.error.fg },
});

export default DriverSheet;
