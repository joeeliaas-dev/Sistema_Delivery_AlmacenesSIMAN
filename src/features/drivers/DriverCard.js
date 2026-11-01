// src/features/drivers/DriverCard.js (dueño: P3)
// Un motorista en la pantalla Motoristas (C53): nombre, zona, si está de baja, su turno y su acceso a
// la app. Funciones de P1: updateDriverShift (turno, se guarda con "Guardar turno"), setDriverActive
// ("Dar de baja" con confirmación / "Reactivar") y setAccessActive ("Quitar acceso" con confirmación /
// "Devolver acceso"). Sin cuenta, "Dar acceso" abre AccessStep en el panel. Sus errores se muestran tal cual.
// De baja no recibe ruta: si era el único activo de su zona, la tarjeta avisa que la zona se queda sin ruta.
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { setAccessActive } from '../../lib/auth';
import { colors, radius, spacing, tones, typography } from '../../theme';
import { setDriverActive, updateDriverShift } from '../fleet/fleetService';
import { driverShift, normalizeTime, shiftError } from './fleetMath';
import { TimeField } from './TimeField';

// Confirmación en la tarjeta (dar de baja, quitar acceso): texto en rojo, acción y "Cancelar"
function Confirm({ text, action, busy, onConfirm, onCancel, a11y, wide }) {
  return (
    <View style={styles.confirm}>
      <Text style={styles.confirmText}>{text}</Text>
      <View style={[styles.confirmActions, !wide && styles.confirmStacked]}>
        <Button
          title={busy ? 'Guardando…' : action}
          variant="secondary"
          size="md"
          disabled={busy}
          onPress={onConfirm}
          accessibilityLabel={a11y}
        />
        <Button title="Cancelar" variant="text" size="md" onPress={onCancel} />
      </View>
    </View>
  );
}

/**
 * @param {{ driver: object, zone: object|null, account: object|null, zoneLeftEmpty: boolean, wide: boolean,
 *   onGiveAccess: () => void }} props  zoneLeftEmpty: ningún otro motorista activo en su zona
 */
export function DriverCard({ driver, zone, account, zoneLeftEmpty, wide, onGiveAccess }) {
  const saved = driverShift(driver);
  const [start, setStart] = useState(saved.shiftStart);
  const [end, setEnd] = useState(saved.shiftEnd);
  const [busy, setBusy] = useState(null); // 'turno' | 'baja' | 'acceso' mientras se guarda
  const [okAt, setOkAt] = useState(null);
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(null); // 'baja' | 'acceso'

  const inactive = driver.active === false;
  const first = driver.name.split(' ')[0];
  const zoneName = zone?.name ?? driver.zoneId ?? 'Sin zona';
  const invalid = shiftError(start, end);
  const dirty = start !== saved.shiftStart || end !== saved.shiftEnd;

  const run = async (what, fn) => {
    setBusy(what);
    setError(null);
    try {
      await fn();
      setConfirm(null);
      return true;
    } catch (err) {
      setError(err?.message || 'No se pudo guardar. Intente de nuevo.');
      return false;
    } finally {
      setBusy(null);
    }
  };
  const saveShift = async () => {
    if (await run('turno', () => updateDriverShift(driver.id, { shiftStart: start, shiftEnd: end })))
      setOkAt(Date.now());
  };

  const access = !account ? (
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
        onPress={() => run('acceso', () => setAccessActive(account.uid, true))}
        accessibilityLabel={`Devolver acceso a ${driver.name}`}
      />
    </>
  ) : (
    <>
      <Text style={styles.accessText} numberOfLines={2}>
        Entra con <Text style={styles.accessEmail}>{account.email}</Text>
      </Text>
      {confirm !== 'acceso' ? (
        <Button
          title="Quitar acceso"
          variant="text"
          size="md"
          onPress={() => setConfirm('acceso')}
          accessibilityLabel={`Quitar acceso a ${driver.name}`}
        />
      ) : null}
    </>
  );

  return (
    <View style={[styles.card, inactive && styles.cardOff]}>
      <View style={styles.head}>
        <View style={styles.who}>
          <Text style={[styles.name, inactive && styles.nameOff]}>{driver.name}</Text>
          <Text style={styles.zone}>{zoneName}</Text>
        </View>
        <View style={styles.state}>
          <View style={[styles.stateDot, { backgroundColor: inactive ? tones.error.accent : tones.success.accent }]} />
          <Text style={styles.stateText}>{inactive ? 'De baja' : 'Activo'}</Text>
        </View>
      </View>

      {inactive ? (
        <View style={[styles.why, { backgroundColor: tones.error.bg }]} accessibilityLiveRegion="polite">
          <Text style={[styles.whyText, { color: tones.error.fg }]}>
            De baja: no recibe ruta.{zoneLeftEmpty ? ` ${zoneName} se queda sin ruta.` : ''}
          </Text>
        </View>
      ) : (
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
          {okAt && !dirty ? (
            <View style={styles.saved} accessibilityLiveRegion="polite">
              <Icon name="check_circle" size={16} color={tones.success.fg} />
              <Text style={styles.savedText}>Turno guardado</Text>
            </View>
          ) : (
            <Button
              title={busy === 'turno' ? 'Guardando…' : 'Guardar turno'}
              size="md"
              disabled={!!busy || !dirty || !!invalid}
              onPress={saveShift}
              accessibilityLabel={`Guardar turno de ${driver.name}`}
              style={!wide && styles.fullWidth}
            />
          )}
        </View>
      )}
      {invalid && dirty ? <Text style={styles.error}>{invalid}</Text> : null}

      <View style={styles.access}>{access}</View>
      {confirm === 'acceso' ? (
        <Confirm
          text={`¿Quitar el acceso a ${first}? Ya no podrá entrar a la app; su historial se queda.`}
          action="Quitar acceso"
          busy={busy === 'acceso'}
          onConfirm={() => run('acceso', () => setAccessActive(account.uid, false))}
          onCancel={() => setConfirm(null)}
          a11y={`Confirmar: quitar acceso a ${driver.name}`}
          wide={wide}
        />
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {inactive ? (
        <Button
          title={busy === 'baja' ? 'Guardando…' : 'Reactivar'}
          variant="secondary"
          size="md"
          disabled={!!busy}
          onPress={() => run('baja', () => setDriverActive(driver.id, true))}
          accessibilityLabel={`Reactivar a ${driver.name}`}
        />
      ) : confirm === 'baja' ? (
        <Confirm
          text={`¿Dar de baja a ${first}? No recibe ruta hasta reactivarlo${
            zoneLeftEmpty ? ` y ${zoneName} se queda sin ruta` : ''
          }. Su historial se queda.`}
          action="Dar de baja"
          busy={busy === 'baja'}
          onConfirm={() => run('baja', () => setDriverActive(driver.id, false))}
          onCancel={() => setConfirm(null)}
          a11y={`Confirmar: dar de baja a ${driver.name}`}
          wide={wide}
        />
      ) : (
        <Button
          title="Dar de baja"
          variant="text"
          size="md"
          onPress={() => setConfirm('baja')}
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
  cardOff: { backgroundColor: colors.surfaceContainer },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  who: { flex: 1, minWidth: 0 },
  name: { ...typography.titleSmall, color: colors.onSurface },
  nameOff: { color: colors.onSurfaceVariant },
  zone: { ...typography.body, color: colors.onSurfaceVariant },
  state: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  stateDot: { width: 8, height: 8, borderRadius: 4 },
  stateText: { ...typography.captionStrong, color: colors.onSurface },
  why: { padding: spacing.sm, borderRadius: radius.md },
  whyText: { ...typography.captionStrong },
  shift: { gap: spacing.md, marginTop: spacing.xs },
  shiftWide: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  times: { flexDirection: 'row', gap: spacing.md },
  fullWidth: { alignSelf: 'stretch' },
  saved: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 44 },
  savedText: { ...typography.captionStrong, color: tones.success.fg },
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
  offButton: { alignSelf: 'flex-start' },
  confirm: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: tones.error.bg },
  confirmText: { ...typography.bodyStrong, color: tones.error.fg },
  confirmActions: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  confirmStacked: { flexDirection: 'column', alignItems: 'stretch' },
  error: { ...typography.captionStrong, color: tones.error.fg },
});

export default DriverCard;
