export const STATUS = {
  PENDIENTE: 'pendiente',
  ASIGNADO: 'asignado',
  EN_RUTA: 'en_ruta',
  ENTREGADO: 'entregado',
  NO_ENTREGADO: 'no_entregado',
  DEVUELTO: 'devuelto',
};
export const PRIORITY = {
  EXPRESS: 'express',
  NORMAL: 'normal',
};
export const ROUTE_STATUS = {
  ASIGNADA: 'asignada',
  EN_CURSO: 'en_curso',
};
export const MAX_ATTEMPTS = 2;
export const FAIL_REASONS = [
  'Cliente ausente',
  'Dirección incorrecta',
  'Cliente rechaza el pedido',
  'Zona inaccesible',
  'Paquete dañado',
];
export const MIN_DESCRIPTION_LENGTH = 10;
export const SIN_ZONA = 'SIN_ZONA';
