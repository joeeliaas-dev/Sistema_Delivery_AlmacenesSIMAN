// src/features/vehicles/VehicleSheet.js (dueño: P3)
// Panel de "Agregar vehículo" y de editar uno existente (rediseño 30 oct), en PanelSheet (hoja desde
// abajo en teléfono, panel a la derecha en escritorio). Se cierra con la X, con "Cancelar" o tocando afuera.
//   1. Formulario: Tipo (opciones grandes; sugiere kg y carga grande, se pueden cambiar), Nombre,
//      Kg máximos y "Lleva carga grande". Valida con vehicleError y muestra el error junto al campo.
//      "Guardar" llama a upsertVehicle de P1; su error se muestra tal cual.
//   2. Vehículo nuevo guardado: "Moto 4 agregado" y "¿Asignarlo a un motorista?" con la lista de
//      motoristas. Al elegir uno, updateDriverSetup (P1) le cambia el vehículo. "Ahora no" cierra.
// Los vehículos no se pueden borrar (reglas de P1): no hay "Eliminar".
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { CAPABILITY } from '../../constants';
import { colors, radius, spacing, typography } from '../../theme';
import { ErrorBanner } from '../driver/ErrorBanner';
import { updateDriverSetup, upsertVehicle } from '../fleet/fleetService';
import { driverVehicleText, hasBigLoad, TYPE_DEFAULTS, VEHICLE_TYPES, vehicleFieldError } from './fleetMath';
import { Field, Notice, PanelSheet, panelStyles, SheetHead } from './PanelSheet';

function VehicleForm({ vehicle, onClose, onSaved }) {
  const isNew = !vehicle?.id;
  const [type, setType] = useState(vehicle?.type ?? null);
  const [label, setLabel] = useState(vehicle?.label ?? '');
  const [maxKg, setMaxKg] = useState(vehicle?.maxKg != null ? String(vehicle.maxKg) : '');
  const [bigLoad, setBigLoad] = useState(hasBigLoad(vehicle));
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const invalid = vehicleFieldError({ type, label, maxKg });
  const shown = tried ? invalid : null;

  const chooseType = (key) => {
    setType(key);
    const d = TYPE_DEFAULTS[key];
    if (d) {
      setMaxKg(String(d.maxKg));
      setBigLoad(d.bigLoad);
    }
  };

  const save = async () => {
    setTried(true);
    if (invalid || saving) return;
    setSaving(true);
    setError(null);
    try {
      const id = await upsertVehicle({
        id: vehicle?.id,
        type,
        label,
        maxKg: Number(maxKg),
        capabilities: bigLoad ? [CAPABILITY.CARGA_GRANDE] : [],
      });
      onSaved({ id, label: label.trim(), isNew });
    } catch (err) {
      setError(err?.message || 'No se pudo guardar el vehículo. Intente de nuevo.');
      setSaving(false);
    }
  };

  return (
    <View style={panelStyles.body}>
      <SheetHead title={isNew ? 'Agregar vehículo' : `Editar ${vehicle.label}`} onClose={onClose} />
      <Field label="Tipo" error={shown?.field === 'type' ? shown.message : null}>
        <View style={styles.types} accessibilityRole="radiogroup" accessibilityLabel="Tipo de vehículo">
          {VEHICLE_TYPES.map((t) => {
            const on = t.key === type;
            return (
              <Pressable
                key={t.key}
                onPress={() => chooseType(t.key)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={t.label}
                style={({ pressed }) => [styles.type, on && styles.typeOn, pressed && !on && panelStyles.pressed]}
              >
                <Icon name={t.icon} size={26} color={on ? colors.primary : colors.onSurfaceVariant} />
                <Text style={[styles.typeText, on && styles.typeTextOn]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </Field>
      <Field label="Nombre" error={shown?.field === 'label' ? shown.message : null}>
        <TextInput
          value={label}
          onChangeText={setLabel}
          placeholder="Moto 4"
          placeholderTextColor={colors.placeholder}
          accessibilityLabel="Nombre del vehículo"
          style={[panelStyles.input, shown?.field === 'label' && panelStyles.inputError]}
        />
      </Field>
      <Field label="Kg máximos" error={shown?.field === 'maxKg' ? shown.message : null}>
        <View style={styles.kgRow}>
          <TextInput
            value={maxKg}
            onChangeText={(t) => setMaxKg(t.replace(/[^\d.]/g, ''))}
            placeholder="40"
            placeholderTextColor={colors.placeholder}
            inputMode="decimal"
            accessibilityLabel="Kilos máximos"
            style={[panelStyles.input, styles.inputKg, shown?.field === 'maxKg' && panelStyles.inputError]}
          />
          <Text style={styles.unit}>kg</Text>
        </View>
      </Field>
      <Pressable
        onPress={() => setBigLoad(!bigLoad)}
        accessibilityRole="switch"
        accessibilityState={{ checked: bigLoad }}
        accessibilityLabel="Lleva carga grande (línea blanca)"
        style={({ pressed }) => [styles.switchRow, pressed && panelStyles.pressed]}
      >
        <View style={panelStyles.flex}>
          <Text style={styles.switchTitle}>Lleva carga grande</Text>
          <Text style={styles.switchNote}>Refrigeradoras, lavadoras y otra línea blanca</Text>
        </View>
        <Switch
          value={bigLoad}
          onValueChange={setBigLoad}
          accessible={false}
          trackColor={{ false: colors.outlineVariant, true: colors.primary }}
          thumbColor={colors.white}
          {...Platform.select({ web: { activeThumbColor: colors.white } })}
        />
      </Pressable>
      <ErrorBanner message={error} />
      <View style={panelStyles.actions}>
        <Button title={saving ? 'Guardando…' : 'Guardar'} disabled={saving} onPress={save} />
        <Button title="Cancelar" variant="text" size="md" onPress={onClose} />
      </View>
    </View>
  );
}

function AssignStep({ saved, drivers, zonesById, vehicles, onClose }) {
  const [busyId, setBusyId] = useState(null);
  const [assigned, setAssigned] = useState(null);
  const [error, setError] = useState(null);

  const assign = async (d) => {
    if (busyId) return;
    setBusyId(d.id);
    setError(null);
    try {
      await updateDriverSetup(d.id, { vehicleId: saved.id });
      setAssigned(d.name.split(' ')[0]);
    } catch (err) {
      setError(err?.message || 'No se pudo asignar. Intente de nuevo.');
    } finally {
      setBusyId(null);
    }
  };

  if (assigned)
    return (
      <View style={panelStyles.body}>
        <SheetHead title={saved.label} onClose={onClose} />
        <Notice text={`${assigned} ahora usa ${saved.label}. Se usa en el próximo Optimizar día.`} />
        <View style={panelStyles.actions}>
          <Button title="Listo" onPress={onClose} />
        </View>
      </View>
    );

  return (
    <View style={panelStyles.body}>
      <SheetHead title="¿Asignarlo a un motorista?" onClose={onClose} />
      <Notice text={`${saved.label} agregado`} />
      <View style={styles.list}>
        {drivers.map((d) => (
          <Pressable
            key={d.id}
            onPress={() => assign(d)}
            disabled={!!busyId}
            accessibilityRole="button"
            accessibilityLabel={`Asignar ${saved.label} a ${d.name}`}
            style={({ pressed }) => [styles.driver, pressed && panelStyles.pressed]}
          >
            <View style={panelStyles.flex}>
              <Text style={styles.driverName}>{d.name}</Text>
              <Text style={styles.driverMeta} numberOfLines={1}>
                {[zonesById[d.zoneId]?.name ?? 'Sin zona', driverVehicleText(d, vehicles)].join(' · ')}
              </Text>
            </View>
            <Text style={styles.driverAction}>{busyId === d.id ? 'Asignando…' : 'Asignar'}</Text>
          </Pressable>
        ))}
      </View>
      <ErrorBanner message={error} />
      <View style={panelStyles.actions}>
        <Button title="Ahora no" variant="secondary" onPress={onClose} />
      </View>
    </View>
  );
}

/**
 * @param {{ open: boolean, vehicle: object|null, drivers: object[], zonesById: object, vehicles: object[],
 *   wide: boolean, onClose: () => void, onEdited: (label: string) => void }} props
 *   vehicle null = agregar uno nuevo. onEdited: se guardó un vehículo existente (el panel se cierra).
 */
export function VehicleSheet({ open, vehicle, drivers, zonesById, vehicles, wide, onClose, onEdited }) {
  // Cada vez que se abre empieza en el formulario: la pantalla cambia la key del panel al abrirlo
  const [saved, setSaved] = useState(null);

  const onSaved = (s) => {
    if (s.isNew) setSaved(s);
    else {
      onEdited?.(s.label);
      onClose();
    }
  };

  const content = saved ? (
    <AssignStep saved={saved} drivers={drivers} zonesById={zonesById} vehicles={vehicles} onClose={onClose} />
  ) : (
    <VehicleForm key={vehicle?.id ?? 'nuevo'} vehicle={vehicle} onClose={onClose} onSaved={onSaved} />
  );

  return (
    <PanelSheet open={open} wide={wide} onClose={onClose}>
      {content}
    </PanelSheet>
  );
}

const styles = StyleSheet.create({
  types: { flexDirection: 'row', gap: spacing.sm },
  type: {
    flex: 1,
    minHeight: 72,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.white,
  },
  typeOn: { borderColor: colors.primary, borderWidth: 2, backgroundColor: colors.primaryContainer },
  typeText: { ...typography.label, color: colors.onSurface },
  typeTextOn: { color: colors.onPrimaryContainer },
  kgRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  inputKg: { width: 140, fontVariant: ['tabular-nums'] },
  unit: { ...typography.body, color: colors.onSurfaceVariant },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  switchTitle: { ...typography.label, color: colors.onSurface },
  switchNote: { ...typography.caption, color: colors.onSurfaceVariant },
  list: { borderTopWidth: 1, borderTopColor: colors.cardBorder },
  driver: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 60,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  driverName: { ...typography.bodyStrong, color: colors.onSurface },
  driverMeta: { ...typography.caption, color: colors.onSurfaceVariant },
  driverAction: { ...typography.label, color: colors.primary },
});

export default VehicleSheet;
