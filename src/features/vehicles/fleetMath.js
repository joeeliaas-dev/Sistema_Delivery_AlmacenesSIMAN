// src/features/vehicles/fleetMath.js (dueño: P3)
// Cálculos puros de la pantalla Vehículos y turnos (S4-13). Las reglas definitivas las aplica
// fleetService de P1 (sus errores se muestran tal cual); aquí solo se ayuda antes de guardar.
import { CAPABILITY, DEFAULT_SHIFT, VEHICLE_TYPE } from '../../constants';

export const VEHICLE_TYPES = [
  { key: VEHICLE_TYPE.MOTO, label: 'Moto', icon: 'two_wheeler' },
  { key: VEHICLE_TYPE.PICKUP, label: 'Pick-up', icon: 'local_shipping' },
  { key: VEHICLE_TYPE.CAMION, label: 'Camión', icon: 'fire_truck' },
];

export const typeLabel = (type) => VEHICLE_TYPES.find((t) => t.key === type)?.label ?? type;
export const hasBigLoad = (v) => (v?.capabilities ?? []).includes(CAPABILITY.CARGA_GRANDE);

/** "7:5" o "700" no; "7:00" → "07:00"; "07:00" → "07:00"; lo inválido se devuelve igual para que P1 lo rechace. */
export function normalizeTime(text) {
  const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(String(text ?? ''));
  if (!m) return String(text ?? '').trim();
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Mensaje para mostrar junto al turno, o null si está bien. */
export function shiftError(start, end) {
  if (!HHMM.test(start)) return `Inicio "${start || 'vacío'}": use HH:MM, por ejemplo 07:00`;
  if (!HHMM.test(end)) return `Fin "${end || 'vacío'}": use HH:MM, por ejemplo 18:00`;
  if (start >= end) return 'El turno debe empezar antes de terminar';
  return null;
}

/** Turno del motorista con los valores por defecto (DEFAULT_SHIFT) si faltan. */
export const driverShift = (d) => ({
  shiftStart: d?.shiftStart ?? DEFAULT_SHIFT.START,
  shiftEnd: d?.shiftEnd ?? DEFAULT_SHIFT.END,
});

/**
 * Avisos por motorista: sin vehículo, vehículo que ya no existe o compartido con otro.
 * @returns {Record<string, string[]>} driverId → avisos en texto normal
 */
export function driverWarnings(drivers, vehicles) {
  const byVehicle = {};
  for (const d of drivers) if (d.vehicleId) (byVehicle[d.vehicleId] ??= []).push(d);
  const ids = new Set(vehicles.map((v) => v.id));
  const out = {};
  for (const d of drivers) {
    const w = [];
    if (!d.vehicleId) w.push('Sin vehículo: no entra a "Optimizar día"');
    else if (!ids.has(d.vehicleId)) w.push('Su vehículo ya no está en el catálogo');
    else {
      const others = byVehicle[d.vehicleId].filter((o) => o.id !== d.id);
      if (others.length) w.push(`Comparte vehículo con ${others.map((o) => o.name).join(', ')}`);
    }
    out[d.id] = w;
  }
  return out;
}

/** Validación previa de un vehículo del catálogo; null si está bien. */
export function vehicleError({ label, maxKg, type }) {
  if (!VEHICLE_TYPES.some((t) => t.key === type)) return 'Elija moto, pick-up o camión';
  if (!String(label ?? '').trim()) return 'Ponga un nombre al vehículo';
  const kg = Number(maxKg);
  if (!(kg > 0)) return 'Los kg máximos deben ser mayores que 0';
  return null;
}

/**
 * Valores que se sugieren al elegir el tipo en "Agregar vehículo" (se pueden cambiar).
 * Moto sin carga grande; pick-up y camión con carga grande (línea blanca).
 */
export const TYPE_DEFAULTS = {
  [VEHICLE_TYPE.MOTO]: { maxKg: 40, bigLoad: false },
  [VEHICLE_TYPE.PICKUP]: { maxKg: 600, bigLoad: true },
  [VEHICLE_TYPE.CAMION]: { maxKg: 2000, bigLoad: true },
};

/**
 * El error de vehicleError con el campo al que pertenece, para mostrarlo junto a él.
 * @returns {{ field: 'type'|'label'|'maxKg', message: string }|null}
 */
export function vehicleFieldError(v) {
  const message = vehicleError(v);
  if (!message) return null;
  const field = /^Elija/.test(message) ? 'type' : /nombre/i.test(message) ? 'label' : 'maxKg';
  return { field, message };
}

/** Qué vehículo usa un motorista, en una línea: "Usa Moto 1", "Sin vehículo", "Usa un vehículo que ya no está". */
export function driverVehicleText(driver, vehicles) {
  if (!driver?.vehicleId) return 'Sin vehículo';
  const v = vehicles.find((x) => x.id === driver.vehicleId);
  return v ? `Usa ${v.label}` : 'Usa un vehículo que ya no está';
}

/** Quién usa un vehículo: "Lo usa Kevin", "Lo usan Kevin y Jorge", "Sin motorista". */
export function vehicleUsersText(vehicle, drivers) {
  const names = drivers.filter((d) => d.vehicleId === vehicle.id).map((d) => d.name.split(' ')[0]);
  if (!names.length) return 'Sin motorista';
  if (names.length === 1) return `Lo usa ${names[0]}`;
  return `Lo usan ${names.slice(0, -1).join(', ')} y ${names.at(-1)}`;
}

/** Texto de la opción de ausencia según la fecha elegida: "No trabaja hoy" o "No trabaja ese día". */
export const absentLabel = (date, today) => (date === today ? 'No trabaja hoy' : 'No trabaja ese día');

/**
 * El error de createDriver (P1) con el campo al que pertenece, para mostrarlo junto a él.
 * @returns {'name'|'phone'|'zone'|'shift'|null}  null: va debajo de "Guardar"
 */
export function driverFieldOf(message) {
  const m = String(message ?? '');
  if (/nombre/i.test(m)) return 'name';
  if (/tel[eé]fono/i.test(m)) return 'phone';
  if (/zona/i.test(m)) return 'zone';
  if (/turno/i.test(m)) return 'shift';
  return null;
}

/** "4 de 5 salen": motoristas que salen la fecha elegida (sin los dados de baja en el total). */
export function availabilityLine(drivers, skipped) {
  const active = drivers.filter((d) => d.active !== false).length;
  const out = drivers.length - skipped.length;
  return `${out} de ${active} ${out === 1 ? 'sale' : 'salen'}`;
}

/** El error de createDriverAccess (P1) con su campo: 'email' | 'password' | null (va debajo del botón). */
export function accessFieldOf(message) {
  const m = String(message ?? '');
  if (/correo/i.test(m)) return 'email';
  if (/contraseña/i.test(m)) return 'password';
  return null;
}

/** Cuenta de motorista de un motorista (users con role motorista y su driverId), o null. */
export const accountForDriver = (accounts, driverId) =>
  (accounts ?? []).find((a) => a.role === 'motorista' && a.driverId === driverId) ?? null;
