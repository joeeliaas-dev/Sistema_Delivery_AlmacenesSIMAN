// app/despacho/vehiculos.js (dueño: P3) — Vehículos y turnos (S4-13)
// Rediseño (30 oct): dos pestañas, "Motoristas (5)" | "Vehículos (5)", con el estilo de las del
// despacho; la elegida se recuerda mientras la pantalla esté abierta.
//   Motoristas: un renglón por motorista con zona, vehículo y turno (updateDriverSetup de P1).
//   Vehículos: "Agregar vehículo" arriba y el catálogo; tocar un vehículo abre el mismo panel
//   (VehicleSheet: hoja desde abajo en teléfono, panel a la derecha en escritorio) para editarlo.
// Un cambio de vehículo se usa en el siguiente "Optimizar día".
// Disponibilidad (C49): la fecha de trabajo arriba de Motoristas (la misma del despacho), "4 de 5
// salen ese día", "Agregar motorista" (DriverSheet, mismo panel que Agregar vehículo) y en cada
// tarjeta "Disponible | No trabaja hoy" y "Dar de baja". En Vehículos, "Disponible | En taller".
// Acceso a la app (C48): las cuentas (users) dicen quién tiene acceso; "Dar acceso" abre el panel en
// "Darle acceso a la app" para ese motorista.
// Hasta que llega la primera respuesta: esqueletos y pestañas sin número (no listas vacías ni ceros;
// sin los vehículos, los avisos de cada motorista saldrían mal).
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Button } from '../../src/components/Button';
import { DateSelector } from '../../src/components/DateSelector';
import { dateLabel } from '../../src/components/DateSelectorParts';
import { Icon } from '../../src/components/Icon';
import { listenDrivers, listenZones } from '../../src/features/catalog/catalogService';
import { ErrorBanner } from '../../src/features/driver/ErrorBanner';
import { availableDrivers } from '../../src/features/fleet/availability';
import { listenVehicles } from '../../src/features/fleet/fleetService';
import { DriverSheet } from '../../src/features/vehicles/DriverSheet';
import { DriverSetupRow } from '../../src/features/vehicles/DriverSetupRow';
import { DriverCardsSkeleton, VehicleRowsSkeleton } from '../../src/features/vehicles/FleetSkeletons';
import { accountForDriver, availabilityLine, driverWarnings } from '../../src/features/vehicles/fleetMath';
import { VehicleRow } from '../../src/features/vehicles/VehicleRow';
import { VehicleSheet } from '../../src/features/vehicles/VehicleSheet';
import { listenAccounts } from '../../src/lib/auth';
import { todayISO } from '../../src/lib/dates';
import { useDateStore } from '../../src/store/dateStore';
import { colors, radius, spacing, tones, typography } from '../../src/theme';

const WIDE = 760;

// Mismas pestañas que el despacho (P2): ancho según el texto, subrayado en la elegida
function Tabs({ tabs, value, onChange }) {
  return (
    <View style={styles.tabs} accessibilityRole="tablist">
      {tabs.map((t) => {
        const active = t.key === value;
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [styles.tab, active && styles.tabActive, pressed && styles.pressed]}
          >
            <Text style={[styles.tabText, active && styles.tabTextActive]} numberOfLines={1}>
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function VehiculosYTurnos() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;

  const [drivers, setDrivers] = useState(null);
  const [vehicles, setVehicles] = useState(null);
  const [zones, setZones] = useState(null);
  const [accounts, setAccounts] = useState(null);
  const [tab, setTab] = useState('motoristas');
  const [sheet, setSheet] = useState({ open: false, vehicle: null });
  const [driverSheet, setDriverSheet] = useState({ open: false, n: 0, accessFor: null });
  const { date } = useDateStore();
  const today = todayISO();
  const [toast, setToast] = useState(null);
  const [error, setError] = useState(null);
  const toastTimer = useRef(null);

  const onError = (err) => setError(err.message);
  useEffect(() => listenDrivers(setDrivers, onError), []);
  useEffect(() => listenVehicles(setVehicles, onError), []);
  useEffect(() => listenZones(setZones, onError), []);
  useEffect(() => listenAccounts(setAccounts, onError), []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // El enlace dice "Centro de despacho": lleva ahí siempre, no a la pantalla anterior
  const goBack = () => router.replace('/despacho');
  const zonesById = Object.fromEntries((zones ?? []).map((z) => [z.id, z]));
  const driversReady = drivers !== null && vehicles !== null && zones !== null && accounts !== null;
  const vehiclesReady = vehicles !== null && drivers !== null;
  const count = (ready, n) => (ready ? ` (${n})` : '');
  const driverList = drivers ?? [];
  const vehicleList = vehicles ?? [];
  const warnings = driverWarnings(driverList, vehicleList);
  const active = driverList.filter((d) => d.active !== false);
  const pending = active.filter((d) => warnings[d.id]?.length).length;
  const { skipped } = availableDrivers(driverList, vehicleList, date);
  const capitalize = (t) => t.charAt(0).toUpperCase() + t.slice(1);

  const showToast = (text) => {
    clearTimeout(toastTimer.current);
    setToast(text);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  };
  // n cambia en cada apertura: el panel se monta de nuevo y empieza en el formulario
  const openSheet = (vehicle) => setSheet((s) => ({ open: true, vehicle, n: (s.n ?? 0) + 1 }));
  const closeSheet = () => setSheet((s) => ({ ...s, open: false }));
  // accessFor: abrir directo en "Darle acceso a la app" para ese motorista
  const openDriverSheet = (accessFor = null) => setDriverSheet((s) => ({ open: true, n: s.n + 1, accessFor }));
  const closeDriverSheet = () => setDriverSheet((s) => ({ ...s, open: false }));

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
            Vehículos y turnos
          </Text>
        </View>
        <ErrorBanner message={error} />

        <View style={styles.panel}>
          <Tabs
            tabs={[
              { key: 'motoristas', label: `Motoristas${count(driversReady, driverList.length)}` },
              { key: 'vehiculos', label: `Vehículos${count(vehiclesReady, vehicleList.length)}` },
            ]}
            value={tab}
            onChange={setTab}
          />

          {toast ? (
            <View style={styles.toast} accessibilityLiveRegion="polite">
              <Icon name="check_circle" size={18} color={tones.success.accent} />
              <Text style={styles.toastText}>{toast}</Text>
            </View>
          ) : null}

          {tab === 'motoristas' ? (
            <View style={styles.tabBody}>
              {driversReady ? (
                <>
                  <DateSelector />
                  <View style={[styles.vehHead, wide && styles.vehHeadWide]}>
                    <View style={wide && styles.flex}>
                      <Text style={styles.dayLine}>
                        {capitalize(dateLabel(date))} · {availabilityLine(driverList, skipped)}
                      </Text>
                      {pending ? (
                        <Text style={styles.note}>
                          {pending} {pending === 1 ? 'motorista necesita' : 'motoristas necesitan'} revisión
                        </Text>
                      ) : null}
                    </View>
                    <Button title="Agregar motorista" icon="add" onPress={() => openDriverSheet()} />
                  </View>
                  {driverList.map((d) => (
                    <DriverSetupRow
                      key={d.id}
                      driver={d}
                      zone={zonesById[d.zoneId]}
                      vehicles={vehicleList}
                      drivers={driverList}
                      wide={wide}
                      date={date}
                      today={today}
                      account={accountForDriver(accounts, d.id)}
                      onGiveAccess={() => openDriverSheet({ id: d.id, name: d.name })}
                    />
                  ))}
                </>
              ) : (
                <DriverCardsSkeleton />
              )}
            </View>
          ) : (
            <View style={styles.tabBody}>
              <View style={[styles.vehHead, wide && styles.vehHeadWide]}>
                <Text style={[styles.note, wide && styles.flex]}>
                  Un vehículo suma capacidad cuando lo usa un motorista.
                </Text>
                <Button title="Agregar vehículo" icon="add" onPress={() => openSheet(null)} />
              </View>
              {!vehiclesReady ? <VehicleRowsSkeleton /> : null}
              {vehiclesReady && vehicleList.length ? (
                <View style={styles.list}>
                  {vehicleList.map((v, i) => (
                    <VehicleRow
                      key={v.id}
                      vehicle={v}
                      drivers={active}
                      last={i === vehicleList.length - 1}
                      onPress={() => openSheet(v)}
                      wide={wide}
                    />
                  ))}
                </View>
              ) : null}
            </View>
          )}
        </View>
      </ScrollView>

      <VehicleSheet
        key={sheet.n ?? 0}
        open={sheet.open}
        vehicle={sheet.vehicle}
        drivers={active}
        zonesById={zonesById}
        vehicles={vehicleList}
        wide={wide}
        onClose={closeSheet}
        onEdited={(label) => showToast(`${label} guardado`)}
      />
      <DriverSheet
        key={`motorista-${driverSheet.n}`}
        open={driverSheet.open}
        wide={wide}
        zones={zones ?? []}
        vehicles={vehicleList}
        drivers={active}
        accessFor={driverSheet.accessFor}
        onClose={closeDriverSheet}
        onSaved={(name) => showToast(`${name} agregado. Sale desde el próximo Optimizar día.`)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl },
  contentWide: { padding: spacing.xxl, width: '100%', maxWidth: 1080, alignSelf: 'center' },
  flex: { flex: 1, minWidth: 0 },
  header: { gap: spacing.xs },
  back: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 44, alignSelf: 'flex-start' },
  backPressed: { opacity: 0.7 },
  backText: { ...typography.label, color: colors.primary },
  title: { ...typography.headline, color: colors.onSurface },
  panel: { gap: spacing.md },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
  },
  tab: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: colors.primary },
  tabText: { ...typography.label, color: colors.onSurfaceVariant },
  tabTextActive: { color: colors.onSurface },
  pressed: { backgroundColor: colors.surfaceContainer },
  tabBody: { gap: spacing.md },
  note: { ...typography.body, color: colors.onSurfaceVariant },
  dayLine: { ...typography.bodyStrong, color: colors.onSurface },
  vehHead: { gap: spacing.md },
  vehHeadWide: { flexDirection: 'row', alignItems: 'center' },
  list: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
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
