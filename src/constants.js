// src/constants.js  (dueño: P1) — contrato común, no cambiar sin la regla 1
export const STATUS = {
  PENDIENTE: 'pendiente',
  ASIGNADO: 'asignado',
  EN_RUTA: 'en_ruta',
  ENTREGADO: 'entregado',
  NO_ENTREGADO: 'no_entregado',
  DEVUELTO: 'devuelto',
};

export const PRIORITY = { EXPRESS: 'express', NORMAL: 'normal' };

export const ROUTE_STATUS = { ASIGNADA: 'asignada', EN_CURSO: 'en_curso' };

export const MAX_ATTEMPTS = 2; // primer intento + 1 reintento

export const FAIL_REASONS = [
  'Cliente ausente',
  'Dirección incorrecta',
  'Cliente rechaza el pedido',
  'Zona inaccesible',
  'Paquete dañado',
];

export const MIN_DESCRIPTION_LENGTH = 10;

export const SIN_ZONA = 'SIN_ZONA';

// ---------- Sprint 4 · despachador (C24) ----------
export const LOCATION_STATUS = {
  ALTA: 'alta',
  REVISAR: 'revisar',
  CONFIRMADA: 'confirmada',
  SIN_UBICACION: 'sin_ubicacion',
};
export const LOCATION_SOURCE = {
  LIBRETA: 'libreta',
  EXCEL: 'excel',
  GEOAPIFY: 'geoapify',
  DESPACHO: 'despacho',
  GPS_ENTREGA: 'gps_entrega',
};
export const ROW_STATUS = { VERDE: 'verde', AMARILLA: 'amarilla', ROJA: 'roja' };
export const VEHICLE_TYPE = { MOTO: 'moto', PICKUP: 'pickup', CAMION: 'camion' };
export const CAPABILITY = { CARGA_GRANDE: 'carga_grande' };
export const BIG_LOAD = { MIN_KG: 30, MIN_M3: 0.15 }; // desde aquí el pedido pide carga_grande
export const DEFAULT_SERVICE_MIN = { NORMAL: 5, CARGA_GRANDE: 20 };
export const GEOCODE_MIN_CONFIDENCE = 0.8;
export const GEOCODE_OK_TYPES = ['building', 'street', 'amenity'];
export const OPTIMIZER_ENGINE = { GEOAPIFY: 'geoapify', LOCAL: 'local' };
export const UNASSIGNED_REASON = {
  CAPACIDAD: 'capacidad',
  VENTANA: 'ventana',
  REQUISITO: 'requisito',
  SIN_UBICACION: 'sin_ubicacion',
};
export const DEFAULT_SHIFT = { START: '07:00', END: '18:00' };
export const API_TIMEOUT_MS = 15000;
// Tope diario de llamadas reales a Geoapify por equipo (N50). Importar 100 pedidos ≈ 80 búsquedas;
// un "Optimizar día" ≈ 5-9 llamadas al Route Planner (las rutas que reciben pedidos de otra zona se
// recalculan). Al llegar al tope se comporta como sin créditos.
export const GEOAPIFY_DAILY_LIMIT = { geocode: 300, routeplanner: 50 };
