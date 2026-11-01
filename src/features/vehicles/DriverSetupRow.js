// src/features/vehicles/DriverSetupRow.js (dueño: P3)
// Un motorista: zona, vehículo (chips) y turno (inicio y fin). "Guardar" llama a updateDriverSetup
// de P1 solo si algo cambió; su error se muestra tal cual. Avisos (sin vehículo o compartido) con
// lo que está elegido ahora, antes de guardar. La fila de vehículos se desplaza sola hasta el que
// usa el motorista, para que a 360 px siempre se vea (Moto 4 queda al final de la fila).
// Disponibilidad (C49, funciones de P1): "Disponible | No trabaja hoy" para la fecha elegida
// (setDriverAbsent), el motivo si no sale ese día (unavailability) y "Dar de baja" / "Reactivar"
// (setDriverActive). Dado de baja, la tarjeta solo muestra el motivo y "Reactivar".
// Acceso a la app (C48): sin cuenta, "Dar acceso" (abre AccessStep en el panel); con cuenta, su correo y
// "Quitar acceso" (con confirmación) o "Devolver acceso" (setAccessActive de P1).
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { setAccessActive } from '../../lib/auth';
import { colors, radius, spacing, tones, typography } from '../../theme';
import { inService, isAbsent, unavailability } from '../fleet/availability';
import { setDriverAbsent, setDriverActive, updateDriverSetup } from '../fleet/fleetService';
import { absentLabel, driverShift, driverWarnings, normalizeTime, shiftError, VEHICLE_TYPES } from './fleetMath';
import { markAccess } from '../session/accountsStub';
import { Segmented } from './Segmented';
import { TimeField } from './TimeField';

function VehicleChip({ v, selected, onPress, onLayout }) {
  const icon = VEHICLE_TYPES.find((t) => t.key === v.type)?.icon ?? 'local_shipping';
  return (
    <Pressable
      onPress={onPress}
      onLayout={onLayout}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${v.label}, ${inService(v) ? `${v.maxKg} kg` : 'en taller'}`}
      style={styles.target}
    >
      {({ pressed }) => (
        <View
          style={[styles.chip, selected ? styles.chipOn : styles.chipOff, pressed && !selected && styles.chipPressed]}
        >
          <Icon name={icon} size={18} color={selected ? colors.onPrimary : colors.onSurfaceVariant} />
          <Text style={[styles.chipText, selected && styles.chipTextOn]}>{v.label}</Text>
          {inService(v) ? (
            <Text style={[styles.chipKg, selected && styles.chipTextOn]}>{v.maxKg} kg</Text>
          ) : (
            <Text style={[styles.chipKg, styles.chipTaller, selected && styles.chipTextOn]}>En taller</Text>
          )}
        </View>
      )}
    </Pressable>
  );
}

// Motivo por el que no sale ese día: dado de baja en rojo; ausente o vehículo en taller en ámbar
function Why({ why }) {
  const t = why.reason === 'baja' ? tones.error : tones.warning;
  return (
    <View style={[styles.why, { backgroundColor: t.bg }]} accessibilityLiveRegion="polite">
      <View style={[styles.whyDot, { backgroundColor: t.accent }]} />
      <Text style={[styles.whyText, { color: t.fg }]}>{why.text}.</Text>
    </View>
  );
}

export function DriverSetupRow({ driver, drivers = [], zone, vehicles, wide, date, today, account, onGiveAccess }) {
  const saved = { vehicleId: driver.vehicleId ?? null, ...driverShift(driver) };
  const [vehicleId, setVehicleId] = useState(saved.vehicleId);
  const [start, setStart] = useState(saved.shiftStart);
  const [end, setEnd] = useState(saved.shiftEnd);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [okAt, setOkAt] = useState(null);
  const [busy, setBusy] = useState(null); // 'ausencia' | 'baja' mientras se guarda
  const [confirmOff, setConfirmOff] = useState(false);
  const [confirmAccess, setConfirmAccess] = useState(false);
  const chipsRef = useRef(null);
  const shownFor = useRef(null); // vehículo guardado hasta el que ya se desplazó la fila
  const viewWidth = useRef(null); // ancho visible de la fila
  const chipBox = useRef(null); // { id, x, width } del chip del vehículo guardado

  // Con la fila y el chip del vehículo guardado medidos: si el chip no cabe, la fila se desplaza hasta
  // él. Una vez por vehículo, para no pelear con el dedo si el despachador recorre la fila.
  const scrollToSaved = () => {
    const box = chipBox.current;
    if (!box || viewWidth.current == null || shownFor.current === box.id) return;
    shownFor.current = box.id;
    if (box.x + box.width <= viewWidth.current) return; // ya se ve
    chipsRef.current?.scrollTo({ x: Math.max(0, box.x - spacing.lg), animated: false });
  };
  const onChipLayout = (id) => (e) => {
    if (id !== saved.vehicleId) return;
    chipBox.current = { id, x: e.nativeEvent.layout.x, width: e.nativeEvent.layout.width };
    scrollToSaved();
  };
  const onRowLayout = (e) => {
    viewWidth.current = e.nativeEvent.layout.width;
    scrollToSaved();
  };

  const invalid = shiftError(start, end);
  const warnings =
    driverWarnings(
      drivers.map((d) => (d.id === driver.id ? { ...d, vehicleId } : d)),
      vehicles,
    )[driver.id] ?? [];
  const dirty = vehicleId !== saved.vehicleId || start !== saved.shiftStart || end !== saved.shiftEnd;

  const why = unavailability(driver, vehicles, date);
  const inactive = driver.active === false;
  const first = driver.name.split(' ')[0];

  // Ausencia y baja se guardan al tocarlas (no esperan a "Guardar"); su error va en la tarjeta
  const run = async (what, fn) => {
    setBusy(what);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err?.message || 'No se pudo guardar. Intente de nuevo.');
    } finally {
      setBusy(null);
    }
  };
  const setAbsent = (key) => run('ausencia', () => setDriverAbsent(driver.id, date, key === 'ausente'));
  const setActive = (active) =>
    run('baja', async () => {
      await setDriverActive(driver.id, active);
      setConfirmOff(false);
    });
  const setAccess = (active) =>
    run('acceso', async () => {
      await setAccessActive(account.uid, active);
      markAccess(account.uid, active);
      setConfirmAccess(false);
    });

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateDriverSetup(driver.id, { vehicleId, shiftStart: start, shiftEnd: end });
      setOkAt(Date.now());
    } catch (err) {
      setError(err?.message || 'No se pudo guardar. Intente de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const head = (
    <View style={styles.head}>
      <View style={styles.who}>
        <Text style={[styles.name, inactive && styles.nameOff]}>{driver.name}</Text>
        <Text style={styles.zone}>{zone?.name ?? driver.zoneId ?? 'Sin zona'}</Text>
      </View>
      <View style={styles.state}>
        <View style={[styles.stateDot, { backgroundColor: why ? tones.warning.accent : tones.success.accent }]} />
        <Text style={styles.stateText}>{inactive ? 'De baja' : why ? 'No sale' : 'Sale'}</Text>
      </View>
    </View>
  );

  if (inactive)
    return (
      <View style={[styles.card, styles.cardOff]}>
        {head}
        <Why why={why} />
        <Button
          title={busy === 'baja' ? 'Guardando…' : 'Reactivar'}
          variant="secondary"
          size="md"
          disabled={!!busy}
          onPress={() => setActive(true)}
          accessibilityLabel={`Reactivar a ${driver.name}`}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    );

  return (
    <View style={styles.card}>
      {head}
      <Segmented
        label={`Disponibilidad de ${first}`}
        options={[
          { key: 'disponible', label: 'Disponible' },
          { key: 'ausente', label: absentLabel(date, today), tone: 'warning' },
        ]}
        value={isAbsent(driver, date) ? 'ausente' : 'disponible'}
        onChange={setAbsent}
        disabled={!!busy}
      />
      {why ? <Why why={why} /> : null}
      <View style={styles.savedRow}>
        {okAt && !dirty ? (
          <View style={styles.saved} accessibilityLiveRegion="polite">
            <Icon name="check_circle" size={16} color={tones.success.fg} />
            <Text style={styles.savedText}>Guardado</Text>
          </View>
        ) : null}
      </View>

      {warnings.map((w) => (
        <View key={w} style={styles.warning}>
          <Icon name="warning_amber" size={16} color={tones.warning.fg} />
          <Text style={styles.warningText}>{w}</Text>
        </View>
      ))}

      <Text style={styles.label}>Vehículo</Text>
      <ScrollView
        ref={chipsRef}
        onLayout={onRowLayout}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        <View style={styles.chipsRow} accessibilityRole="radiogroup" accessibilityLabel={`Vehículo de ${driver.name}`}>
          {vehicles.map((v) => (
            <VehicleChip
              key={v.id}
              v={v}
              selected={v.id === vehicleId}
              onPress={() => setVehicleId(v.id)}
              onLayout={onChipLayout(v.id)}
            />
          ))}
        </View>
      </ScrollView>

      <View style={[styles.shift, wide && styles.shiftWide]}>
        <View style={styles.times}>
          <TimeField
            label="Inicio del turno"
            value={start}
            onChange={setStart}
            onBlur={() => setStart(normalizeTime(start))}
            invalid={!!invalid && !/^Fin/.test(invalid)}
          />
          <TimeField
            label="Fin del turno"
            value={end}
            onChange={setEnd}
            onBlur={() => setEnd(normalizeTime(end))}
            invalid={!!invalid && !/^Inicio/.test(invalid)}
          />
        </View>
        <Button
          title={saving ? 'Guardando…' : 'Guardar'}
          icon="save"
          size="md"
          disabled={saving || !dirty || !!invalid}
          onPress={save}
          accessibilityLabel={`Guardar vehículo y turno de ${driver.name}`}
          style={!wide && styles.fullWidth}
        />
      </View>
      {invalid && dirty ? <Text style={styles.error}>{invalid}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.access}>
        {!account ? (
          <>
            <Text style={styles.accessText}>Sin acceso a la app</Text>
            <Button
              title="Dar acceso"
              variant="secondary"
              size="md"
              onPress={onGiveAccess}
              accessibilityLabel={`Dar acceso a la app a ${driver.name}`}
            />
          </>
        ) : account.active === false ? (
          <>
            <Text style={styles.accessText} numberOfLines={2}>
              Acceso quitado · {account.email}
            </Text>
            <Button
              title={busy === 'acceso' ? 'Guardando…' : 'Devolver acceso'}
              variant="secondary"
              size="md"
              disabled={!!busy}
              onPress={() => setAccess(true)}
              accessibilityLabel={`Devolver acceso a ${driver.name}`}
            />
          </>
        ) : (
          <>
            <Text style={styles.accessText} numberOfLines={2}>
              Entra con <Text style={styles.accessEmail}>{account.email}</Text>
            </Text>
            {!confirmAccess ? (
              <Button
                title="Quitar acceso"
                variant="text"
                size="md"
                onPress={() => setConfirmAccess(true)}
                accessibilityLabel={`Quitar acceso a ${driver.name}`}
              />
            ) : null}
          </>
        )}
      </View>
      {confirmAccess ? (
        <View style={styles.confirm}>
          <Text style={styles.confirmText}>
            ¿Quitar el acceso a {first}? Ya no podrá entrar a la app; su historial se queda.
          </Text>
          <View style={[styles.confirmActions, !wide && styles.confirmStacked]}>
            <Button
              title={busy === 'acceso' ? 'Guardando…' : 'Quitar acceso'}
              variant="secondary"
              size="md"
              disabled={!!busy}
              onPress={() => setAccess(false)}
              accessibilityLabel={`Confirmar: quitar acceso a ${driver.name}`}
            />
            <Button title="Cancelar" variant="text" size="md" onPress={() => setConfirmAccess(false)} />
          </View>
        </View>
      ) : null}

      {confirmOff ? (
        <View style={styles.confirm}>
          <Text style={styles.confirmText}>
            ¿Dar de baja a {first}? No sale en ninguna ruta hasta reactivarlo. Su historial se queda.
          </Text>
          <View style={[styles.confirmActions, !wide && styles.confirmStacked]}>
            <Button
              title={busy === 'baja' ? 'Guardando…' : 'Dar de baja'}
              variant="secondary"
              size="md"
              disabled={!!busy}
              onPress={() => setActive(false)}
              accessibilityLabel={`Confirmar: dar de baja a ${driver.name}`}
            />
            <Button title="Cancelar" variant="text" size="md" onPress={() => setConfirmOff(false)} />
          </View>
        </View>
      ) : (
        <Button
          title="Dar de baja"
          variant="text"
          size="md"
          onPress={() => setConfirmOff(true)}
          accessibilityLabel={`Dar de baja a ${driver.name}`}
          style={styles.offButton}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  who: { flex: 1, minWidth: 0 },
  cardOff: { backgroundColor: colors.surfaceContainer },
  name: { ...typography.titleSmall, fontFamily: typography.fonts.bold, color: colors.onSurface },
  nameOff: { color: colors.onSurfaceVariant },
  state: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  stateDot: { width: 8, height: 8, borderRadius: 4 },
  stateText: { ...typography.captionStrong, color: colors.onSurface },
  why: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md },
  whyDot: { width: 8, height: 8, borderRadius: 4 },
  whyText: { ...typography.captionStrong, flexShrink: 1 },
  savedRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  chipTaller: { color: tones.warning.fg },
  offButton: { alignSelf: 'flex-start' },
  access: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  accessText: { ...typography.body, color: colors.onSurfaceVariant, flex: 1, minWidth: 160 },
  accessEmail: { ...typography.bodyStrong, color: colors.onSurface },
  confirm: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: tones.error.bg },
  confirmText: { ...typography.bodyStrong, color: tones.error.fg },
  confirmActions: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  confirmStacked: { flexDirection: 'column', alignItems: 'stretch' },
  zone: { ...typography.body, color: colors.onSurfaceVariant },
  saved: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  savedText: { ...typography.captionStrong, color: tones.success.fg },
  warning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: tones.warning.bg,
  },
  warningText: { ...typography.captionStrong, color: tones.warning.fg, flexShrink: 1 },
  label: { ...typography.caption, color: colors.onSurfaceVariant, marginTop: spacing.xs },
  chips: { paddingRight: spacing.sm },
  chipsRow: { flexDirection: 'row', gap: spacing.sm },
  target: { minHeight: 44, justifyContent: 'center' },
  chip: {
    height: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  chipOff: { backgroundColor: colors.white, borderColor: colors.cardBorder },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipPressed: { backgroundColor: colors.surfaceContainer },
  chipText: { ...typography.label, color: colors.onSurface },
  chipKg: { ...typography.caption, color: colors.onSurfaceVariant },
  chipTextOn: { color: colors.onPrimary },
  shift: { gap: spacing.md, marginTop: spacing.xs },
  shiftWide: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  times: { flexDirection: 'row', gap: spacing.md },
  fullWidth: { alignSelf: 'stretch' },
  error: { ...typography.captionStrong, color: tones.error.fg },
});

export default DriverSetupRow;
