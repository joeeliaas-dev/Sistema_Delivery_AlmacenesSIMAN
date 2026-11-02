// src/features/orders/columns.js  (dueño: P1)
// Columnas de la plantilla y sus sinónimos. Los encabezados se comparan normalizados:
// minúsculas, sin tildes y con los espacios convertidos en "_".
export const COLUMNS = [
  'pedido',
  'cliente',
  'telefono',
  'direccion',
  'municipio',
  'referencia',
  'fecha',
  'desde',
  'hasta',
  'prioridad',
  'bultos',
  'lat',
  'lng',
];

export const SYNONYMS = {
  orden: 'pedido',
  numero_de_pedido: 'pedido',
  no_pedido: 'pedido',
  nombre: 'cliente',
  nombre_cliente: 'cliente',
  celular: 'telefono',
  tel: 'telefono',
  dir: 'direccion',
  domicilio: 'direccion',
  referencias: 'referencia',
  fecha_entrega: 'fecha',
  hora_desde: 'desde',
  hora_hasta: 'hasta',
  paquetes: 'bultos',
  latitud: 'lat',
  longitud: 'lng',
  lon: 'lng',
};

export const normalizeHeader = (h = '') => {
  const k = String(h).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, '_');
  return SYNONYMS[k] ?? k;
};

/** Fila de ejemplo para la plantilla. */
export const TEMPLATE_EXAMPLE = {
  pedido: 'WEB-900001',
  cliente: 'María López',
  telefono: '7012-3456',
  direccion: 'Calle La Mascota #26, Colonia Escalón',
  municipio: 'San Salvador Centro',
  referencia: 'Portón negro frente al parque',
  fecha: '',
  desde: '09:00',
  hasta: '12:00',
  prioridad: 'normal',
  bultos: 1,
  lat: '',
  lng: '',
};
