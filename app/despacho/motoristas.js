// app/despacho/motoristas.js (dueño: P3) — Motoristas (C53; antes "Vehículos y turnos")
// Una tarjeta por motorista: nombre, zona, turno, si está de baja y si tiene acceso a la app
// (DriverCard). Arriba, "5 motoristas · 1 de baja", las zonas que se quedan sin ruta (ningún motorista
// activo: Optimizar día no les arma ruta) y "Agregar motorista" (DriverSheet: hoja desde abajo en
// teléfono, panel a la derecha en escritorio; al crear ofrece "Darle acceso a la app").
// Las cuentas (users, listenAccounts de P1) dicen quién tiene acceso.
// Hasta que llega la primera respuesta: esqueleto (no una lista vacía ni "0 motoristas").
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Button } from '../../src/components/Button';
import { Icon } from '../../src/components/Icon';
import { listenDrivers, listenZones } from '../../src/features/catalog/catalogService';
import { ErrorBanner } from '../../src/features/driver/ErrorBanner';
import { DriverCard } from '../../src/features/drivers/DriverCard';
import { DriverSheet } from '../../src/features/drivers/DriverSheet';
import { DriversSkeleton } from '../../src/features/drivers/DriversSkeleton';
import { accountForDriver, driversLine, zonesWithoutDriver } from '../../src/features/drivers/fleetMath';
import { listenAccounts } from '../../src/lib/auth';
import { colors, radius, spacing, tones, typography } from '../../src/theme';

const WIDE = 760;

export default function Motoristas() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;

  const [drivers, setDrivers] = useState(null);
  const [zones, setZones] = useState(null);
  const [accounts, setAccounts] = useState(null);
  const [sheet, setSheet] = useState({ open: false, n: 0, accessFor: null });
  const [toast, setToast] = useState(null);
  const [error, setError] = useState(null);
  const toastTimer = useRef(null);

  const onError = (err) => setError(err.message);
  useEffect(() => listenDrivers(setDrivers, onError), []);
  useEffect(() => listenZones(setZones, onError), []);
  useEffect(() => listenAccounts(setAccounts, onError), []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // El enlace dice "Centro de despacho": lleva ahí siempre, no a la pantalla anterior
  const goBack = () => router.replace('/despacho');
  const ready = drivers !== null && zones !== null && accounts !== null;
  const driverList = drivers ?? [];
  const zonesById = Object.fromEntries((zones ?? []).map((z) => [z.id, z]));
  const emptyZones = zonesWithoutDriver(zones, driverList);
  const emptyIds = new Set(emptyZones.map((z) => z.id));

  const showToast = (text) => {
    clearTimeout(toastTimer.current);
    setToast(text);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  };
  // n cambia en cada apertura: el panel se monta de nuevo y empieza en el formulario.
  // accessFor: abrir directo en "Darle acceso a la app" para ese motorista
  const openSheet = (accessFor = null) => setSheet((s) => ({ open: true, n: s.n + 1, accessFor }));
  const closeSheet = () => setSheet((s) => ({ ...s, open: false }));

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, wide && styles.contentWide]}>
        <View style={styles.header}>
          <Pressable
            onPress={goBack}
            accessibilityRole="button"
            accessibilityLabel="Volver al Centro de despacho"
            style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
          >
            <Icon name="arrow_back" size={20} color={colors.primary} />
            <Text style={styles.backText}>Centro de despacho</Text>
          </Pressable>
          <Text style={styles.title} accessibilityRole="header">
            Motoristas
          </Text>
        </View>
        <ErrorBanner message={error} />

        {ready ? (
          <>
            <View style={[styles.top, wide && styles.topWide]}>
              <Text style={[styles.line, wide && styles.flex]}>{driversLine(driverList)}</Text>
              <Button title="Agregar motorista" icon="add" onPress={() => openSheet()} />
            </View>
            {emptyZones.length ? (
              <View style={styles.warn} accessibilityLiveRegion="polite">
                <View style={styles.warnDot} />
                <Text style={styles.warnText}>
                  Sin motorista activo, sin ruta: {emptyZones.map((z) => z.name).join(', ')}
                </Text>
              </View>
            ) : null}
            {toast ? (
              <View style={styles.toast} accessibilityLiveRegion="polite">
                <Icon name="check_circle" size={18} color={tones.success.accent} />
                <Text style={styles.toastText}>{toast}</Text>
              </View>
            ) : null}
            {driverList.map((d) => (
              <DriverCard
                key={d.id}
                driver={d}
                zone={zonesById[d.zoneId]}
                account={accountForDriver(accounts, d.id)}
                // Si se da de baja, ¿queda alguien activo en su zona? (para avisarlo antes de confirmar)
                zoneLeftEmpty={
                  emptyIds.has(d.zoneId) ||
                  !driverList.some((o) => o.id !== d.id && o.zoneId === d.zoneId && o.active !== false)
                }
                wide={wide}
                onGiveAccess={() => openSheet({ id: d.id, name: d.name })}
              />
            ))}
          </>
        ) : (
          <DriversSkeleton />
        )}
      </ScrollView>

      <DriverSheet
        key={`motorista-${sheet.n}`}
        open={sheet.open}
        wide={wide}
        zones={zones ?? []}
        accessFor={sheet.accessFor}
        onClose={closeSheet}
        onSaved={(name) => showToast(`${name} agregado. Sale desde el próximo Optimizar día.`)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
  contentWide: { padding: spacing.xxl, width: '100%', maxWidth: 960, alignSelf: 'center' },
  flex: { flex: 1, minWidth: 0 },
  header: { gap: spacing.xs, marginBottom: spacing.sm },
  back: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 44, alignSelf: 'flex-start' },
  backPressed: { opacity: 0.7 },
  backText: { ...typography.label, color: colors.primary },
  title: { ...typography.headline, color: colors.onSurface },
  top: { gap: spacing.md },
  topWide: { flexDirection: 'row', alignItems: 'center' },
  line: { ...typography.bodyStrong, color: colors.onSurface },
  warn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: tones.warning.bg,
  },
  warnDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: tones.warning.accent },
  warnText: { ...typography.bodyStrong, color: tones.warning.fg, flex: 1 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: tones.success.bg,
  },
  toastText: { ...typography.bodyStrong, color: tones.success.fg, flex: 1 },
});
