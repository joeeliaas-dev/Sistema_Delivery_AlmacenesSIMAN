// __tests__/importRows.test.js  (dueño: P3) — cálculos de la pantalla Importar pedidos (S4-10)
import {
  filterRows,
  loadedDate,
  loadButtonLabel,
  needsReviewCount,
  rowReason,
  skippedNote,
  summarizeRows,
  rowDetail,
  rowStateLabel,
} from '../src/features/importer/importRows';

const row = (rowNumber, status, { errors = [], warnings = [], loc } = {}) => ({
  rowNumber,
  status,
  errors,
  warnings,
  order: { orderNumber: `WEB-${rowNumber}`, location: loc ? { status: loc } : null },
});

const rows = [
  row(2, 'verde', { loc: 'alta' }),
  row(3, 'verde', { loc: 'confirmada' }),
  row(4, 'amarilla', { warnings: ['Ubicación: confianza baja'], loc: 'revisar' }),
  row(5, 'amarilla', { warnings: ['Ubicación: No se encontró la dirección'], loc: 'sin_ubicacion' }),
  row(6, 'amarilla', { warnings: ['Municipio "Sn Salvador" no reconocido'], loc: 'alta' }),
  row(7, 'roja', { errors: ['Teléfono 7123-45: debe tener 8 dígitos', 'Falta la fecha'] }),
];

describe('summarizeRows', () => {
  it('cuenta por color y lo que se carga (todo menos las rojas)', () => {
    expect(summarizeRows(rows)).toEqual({ verde: 2, amarilla: 3, roja: 1, total: 6, toLoad: 5 });
  });
  it('lista vacía', () => {
    expect(summarizeRows([])).toEqual({ verde: 0, amarilla: 0, roja: 0, total: 0, toLoad: 0 });
  });
});

describe('filterRows', () => {
  it('sin filtro devuelve todas', () => expect(filterRows(rows, null)).toHaveLength(6));
  it('filtra por color', () => expect(filterRows(rows, 'amarilla').map((r) => r.rowNumber)).toEqual([4, 5, 6]));
});

describe('rowReason', () => {
  it('roja: muestra los errores', () =>
    expect(rowReason(rows[5])).toBe('Teléfono 7123-45: debe tener 8 dígitos · Falta la fecha'));
  it('amarilla: muestra las advertencias', () => expect(rowReason(rows[2])).toBe('Ubicación: confianza baja'));
  it('verde: vacío', () => expect(rowReason(rows[0])).toBe(''));
});

describe('needsReviewCount', () => {
  it('cuenta las cargadas con ubicación revisar o sin_ubicacion (no las de municipio ni las rojas)', () =>
    expect(needsReviewCount(rows)).toBe(2));
});

describe('textos', () => {
  it('botón en singular y plural', () => {
    expect(loadButtonLabel(1)).toBe('Cargar 1 pedido');
    expect(loadButtonLabel(96)).toBe('Cargar 96 pedidos');
  });
  it('nota de filas con error', () => {
    expect(skippedNote(0)).toBeNull();
    expect(skippedNote(1)).toBe('1 con error no se carga');
    expect(skippedNote(4)).toBe('4 con error no se cargan');
  });
});

describe('loadedDate', () => {
  const dated = (status, scheduledDate) => ({ status, order: { scheduledDate } });
  it('el primer día entre las filas que se cargan (las rojas no cuentan)', () =>
    expect(
      loadedDate([dated('roja', '2026-10-27'), dated('verde', '2026-10-29'), dated('amarilla', '2026-10-28')], 'X'),
    ).toBe('2026-10-28'));
  it('sin filas cargables, la fecha de respaldo', () =>
    expect(loadedDate([dated('roja', '2026-10-27')], '2026-10-30')).toBe('2026-10-30'));
});

describe('columna Estado en palabras de bodega (rediseño)', () => {
  const roja = (...errors) => ({ status: 'roja', errors, warnings: [] });
  const amarilla = (...warnings) => ({ status: 'amarilla', errors: [], warnings });

  test('lista, revisar y error con la palabra del campo', () => {
    expect(rowStateLabel({ status: 'verde', errors: [], warnings: [] })).toBe('Listo');
    expect(rowStateLabel(amarilla('Ubicación: confianza baja'))).toBe('Revisar dirección');
    expect(rowStateLabel(roja('Teléfono 1234: debe tener 8 dígitos y empezar con 2, 6 o 7'))).toBe('Error: teléfono');
    expect(rowStateLabel(roja('Falta el teléfono'))).toBe('Error: teléfono');
    expect(rowStateLabel(roja('Pedido WEB-1: ya existe en Trazza'))).toBe('Error: ya cargado');
    expect(rowStateLabel(roja('Fecha "32/13/2026": use AAAA-MM-DD o DD/MM/AAAA', 'Falta el municipio'))).toBe(
      'Error: fecha +1',
    );
    expect(rowStateLabel(roja('algo nuevo'))).toBe('Error');
  });

  test('el detalle quita el prefijo técnico de ubicación', () => {
    expect(rowDetail(amarilla('Ubicación: confianza baja'))).toEqual(['Dirección dudosa']);
    expect(rowDetail(amarilla('Ubicación: la colonia no coincide con la del Excel'))).toEqual([
      'La colonia no coincide con la del Excel',
    ]);
    expect(rowDetail(amarilla('Ubicación: Sin respuesta de Geoapify: timeout'))).toEqual([
      'No se pudo buscar la dirección',
    ]);
    expect(rowDetail(roja('Falta el teléfono', 'Falta la dirección'))).toEqual([
      'Falta el teléfono',
      'Falta la dirección',
    ]);
  });
});
