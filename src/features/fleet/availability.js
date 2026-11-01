// src/features/fleet/availability.js  (dueño: P1) — quién trabaja un día (C49), cálculos puros
// Un motorista no sale si está dado de baja (active === false), si marcó ausencia ese día
// (absentDates) o si su vehículo está en taller (vehicle.status === 'taller').
export const VEHICLE_STATUS = { DISPONIBLE: 'disponible', TALLER: 'taller' };

export const isAbsent = (driver, date) => (driver?.absentDates ?? []).includes(date);
export const inService = (vehicle) => (vehicle?.status ?? VEHICLE_STATUS.DISPONIBLE) !== VEHICLE_STATUS.TALLER;

/**
 * Por qué un motorista no sale ese día, o null si sale.
 * @returns {{ reason: 'baja'|'ausente'|'taller', text: string }|null}
 */
export function unavailability(driver, vehicles, date) {
  const name = driver?.name ?? driver?.id;
  if (driver?.active === false) return { reason: 'baja', text: `${name}: de baja` };
  if (isAbsent(driver, date)) return { reason: 'ausente', text: `${name} no trabaja ese día` };
  const vehicle = vehicles.find((v) => v.id === driver?.vehicleId);
  if (vehicle && !inService(vehicle)) return { reason: 'taller', text: `${name}: ${vehicle.label} está en taller` };
  return null;
}

/**
 * Motoristas que salen una fecha y los que no, con el aviso para el despacho.
 * @returns {{ drivers: object[], skipped: Array<{ driverId, reason, text }> }}
 */
export function availableDrivers(drivers, vehicles, date) {
  const out = { drivers: [], skipped: [] };
  for (const d of drivers) {
    const why = unavailability(d, vehicles, date);
    if (why) out.skipped.push({ driverId: d.id, ...why });
    else out.drivers.push(d);
  }
  return out;
}
