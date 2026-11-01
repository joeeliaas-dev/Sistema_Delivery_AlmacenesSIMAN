// src/features/vehicles/VehicleRow.js (dueño: P3)
// Un vehículo del catálogo (rediseño 30 oct): ícono del tipo, nombre, "Moto · 40 kg · Carga grande" y
// quién lo usa. Al tocarlo se abre el panel de edición (VehicleSheet); no se edita dentro de la lista.
// Debajo, "Disponible | En taller" (setVehicleStatus de P1, C49): se guarda al tocarlo. En taller, el
// motorista que lo usa no sale en "Optimizar día".
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../../components/Icon';
import { colors, spacing, tones, typography } from '../../theme';
import { inService, VEHICLE_STATUS } from '../fleet/availability';
import { setVehicleStatus } from '../fleet/fleetService';
import { hasBigLoad, typeLabel, VEHICLE_TYPES, vehicleUsersText } from './fleetMath';
import { Segmented } from './Segmented';

export function VehicleRow({ vehicle, drivers, last, onPress, wide }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const icon = VEHICLE_TYPES.find((t) => t.key === vehicle.type)?.icon ?? 'local_shipping';
  const facts = [typeLabel(vehicle.type), `${vehicle.maxKg} kg`, hasBigLoad(vehicle) ? 'Carga grande' : null]
    .filter(Boolean)
    .join(' · ');
  const users = vehicleUsersText(vehicle, drivers);
  const unused = users === 'Sin motorista';
  const working = inService(vehicle);
  const riders = drivers.filter((d) => d.vehicleId === vehicle.id).map((d) => d.name.split(' ')[0]);

  const setStatus = async (status) => {
    setBusy(true);
    setError(null);
    try {
      await setVehicleStatus(vehicle.id, status);
    } catch (err) {
      setError(err?.message || 'No se pudo guardar. Intente de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.wrap, !last && styles.divider, wide && styles.wrapWide]}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${vehicle.label}, ${facts}. ${users}. Editar`}
        style={({ pressed }) => [styles.row, wide && styles.rowWide, pressed && styles.pressed]}
      >
        <Icon name={icon} size={24} color={colors.onSurfaceVariant} />
        <View style={styles.text}>
          <Text style={styles.name}>{vehicle.label}</Text>
          <Text style={styles.facts}>{facts}</Text>
        </View>
        <View style={styles.users}>
          {unused ? <View style={styles.dot} /> : null}
          <Text style={[styles.usersText, unused && styles.usersUnused]} numberOfLines={2}>
            {users}
          </Text>
        </View>
        <Icon name="chevron_right" size={20} color={colors.onSurfaceVariant} />
      </Pressable>
      <View style={[styles.status, wide && styles.statusWide]}>
        <Segmented
          label={`Estado de ${vehicle.label}`}
          options={[
            { key: VEHICLE_STATUS.DISPONIBLE, label: 'Disponible' },
            { key: VEHICLE_STATUS.TALLER, label: 'En taller', tone: 'warning' },
          ]}
          value={working ? VEHICLE_STATUS.DISPONIBLE : VEHICLE_STATUS.TALLER}
          onChange={setStatus}
          disabled={busy}
        />
        {!working && riders.length ? (
          <Text style={styles.note}>
            {riders.join(' y ')} no {riders.length === 1 ? 'sale' : 'salen'} hasta que vuelva del taller
          </Text>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingBottom: spacing.md },
  wrapWide: { flexDirection: 'row', alignItems: 'center', paddingBottom: 0, paddingRight: spacing.lg },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 64,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  rowWide: { flex: 1, minWidth: 0 },
  pressed: { backgroundColor: colors.surfaceContainer },
  text: { flex: 1, minWidth: 0 },
  name: { ...typography.bodyStrong, color: colors.onSurface },
  facts: { ...typography.caption, color: colors.onSurfaceVariant },
  users: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, maxWidth: '40%' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: tones.warning.accent },
  usersText: { ...typography.caption, color: colors.onSurfaceVariant, textAlign: 'right' },
  usersUnused: { color: tones.warning.fg },
  status: { paddingHorizontal: spacing.lg, gap: spacing.xs },
  statusWide: { width: 260, paddingHorizontal: 0, paddingVertical: spacing.sm },
  note: { ...typography.captionStrong, color: tones.warning.fg },
  error: { ...typography.captionStrong, color: tones.error.fg },
});

export default VehicleRow;
