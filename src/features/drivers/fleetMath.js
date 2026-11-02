// src/features/drivers/fleetMath.js (dueño: P3)
// Cálculos puros de la pantalla Motoristas (C53): turno, errores junto a su campo, cuentas de acceso y
// zonas que se quedan sin ruta. Las reglas definitivas son de fleetService y auth (P1); sus errores se
// muestran tal cual.
import { DEFAULT_SHIFT } from '../../constants';

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

/** Zonas sin ningún motorista activo: Optimizar día no les arma ruta (C53). */
export const zonesWithoutDriver = (zones, drivers) =>
  (zones ?? []).filter((z) => !(drivers ?? []).some((d) => d.zoneId === z.id && d.active !== false));

/** "5 motoristas · 1 de baja" para la línea de arriba. */
export function driversLine(drivers) {
  const off = drivers.filter((d) => d.active === false).length;
  const all = `${drivers.length} ${drivers.length === 1 ? 'motorista' : 'motoristas'}`;
  return off ? `${all} · ${off} de baja` : all;
}
