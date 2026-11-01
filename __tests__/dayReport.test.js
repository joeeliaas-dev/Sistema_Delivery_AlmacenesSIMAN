// __tests__/dayReport.test.js  (dueño: P2)
// Totales del Reporte del día y las hojas del Excel (src/features/dispatch/dayReport.js).
import * as XLSX from 'xlsx';
import { columnWidths, dayReport, reportFileName, reportSheets, reportStage } from '../src/features/dispatch/dayReport';

const DATE = '2026-10-30';
const NOW = new Date(2026, 9, 30, 9, 0);
const ship = (id, extra) => ({
  id,
  code: id,
  zoneId: 'Z1',
  scheduledDate: DATE,
  status: 'pendiente',
  attempts: 0,
  routeId: null,
  unassignedReason: null,
  customer: { name: `Cliente ${id}` },
  ...extra,
});
const fail = (reason, at = '2026-10-30T15:30:00') => ({ lastFailure: { reason, at } });

const shipments = [
  ship('S1', { status: 'entregado', routeId: 'R1', lastEvidence: { at: '2026-10-30T08:41:00' } }),
  ship('S2', { status: 'entregado', routeId: 'R1', lastEvidence: { at: '2026-10-30T09:10:00' } }),
  ship('S3', { status: 'asignado', routeId: 'R1' }),
  ship('S4', { status: 'no_entregado', attempts: 1, ...fail('Cliente ausente') }),
  ship('S5', { status: 'no_entregado', attempts: 1, ...fail('Cliente ausente') }),
  ship('S6', { status: 'no_entregado', attempts: 1, ...fail('Zona inaccesible') }),
  ship('S7', { status: 'devuelto', attempts: 2, ...fail('Dirección incorrecta') }),
  ship('S8', { unassignedReason: 'capacidad' }),
  ship('S9', { unassignedReason: 'capacidad' }),
  ship('S10', { unassignedReason: 'sin_ubicacion' }),
  ship('S11'), // nuevo, sin rutear
];
const routes = [
  {
    id: 'R1',
    code: 'Ruta B',
    date: DATE,
    zoneId: 'Z1',
    driverId: 'D1',
    status: 'asignada',
    totalKm: 14.66,
    baselineKm: 17.8,
    estEnd: '2026-10-30T07:50:00',
    stops: [
      { shipmentId: 'S1', seq: 1, etaISO: '2026-10-30T07:05:00' },
      { shipmentId: 'S2', seq: 2, etaISO: '2026-10-30T07:20:00' },
      { shipmentId: 'S3', seq: 3, etaISO: '2026-10-30T07:40:00' },
    ],
  },
];
const drivers = [{ id: 'D1', name: 'Kevin Rivas' }];
const zones = [{ id: 'Z1', name: 'San Salvador Centro' }];

describe('reportStage', () => {
  it('pone cada pedido en un solo renglón', () => {
    expect(reportStage({ status: 'entregado' })).toBe('entregado');
    expect(reportStage({ status: 'devuelto' })).toBe('devuelto');
    expect(reportStage({ status: 'no_entregado' })).toBe('no_entregado');
    expect(reportStage({ id: 'x', status: 'pendiente', unassignedReason: 'capacidad' })).toBe('sin_asignar');
    expect(reportStage({ id: 'x', status: 'pendiente' }, new Set(['x']))).toBe('sin_asignar');
    expect(reportStage({ id: 'x', status: 'asignado', routeId: 'R1' })).toBe('pendiente');
    expect(reportStage({ id: 'x', status: 'pendiente' })).toBe('pendiente');
  });
});

describe('dayReport', () => {
  const report = dayReport({ shipments, routes, drivers, zones, date: DATE, now: NOW });

  it('cuenta entregados, no entregados por motivo, devueltos, pendientes y sin asignar por motivo', () => {
    expect(report.total).toBe(11);
    expect(report.entregados).toBe(2);
    expect(report.devueltos).toBe(1);
    expect(report.pendientes).toBe(2); // S3 en ruta + S11 nuevo
    expect(report.noEntregados).toEqual({
      total: 3,
      byReason: [
        { key: 'Cliente ausente', label: 'Cliente ausente', count: 2 },
        { key: 'Zona inaccesible', label: 'Zona inaccesible', count: 1 },
      ],
    });
    expect(report.sinAsignar.total).toBe(3);
    expect(report.sinAsignar.byReason.map((r) => [r.key, r.count])).toEqual([
      ['capacidad', 2],
      ['sin_ubicacion', 1],
    ]);
    // Los renglones suman el total: ningún pedido se cuenta dos veces
    const sum =
      report.entregados + report.noEntregados.total + report.devueltos + report.pendientes + report.sinAsignar.total;
    expect(sum).toBe(report.total);
  });

  it('una fila por motorista con paradas hechas, km, ahorro y fin (planeado si no ha salido)', () => {
    expect(report.drivers).toEqual([
      {
        routeId: 'R1',
        code: 'Ruta B',
        driverName: 'Kevin Rivas',
        stage: 'Asignada',
        done: 2,
        total: 3,
        totalKm: 14.7,
        savedKm: 3.1,
        end: '07:50',
      },
    ]);
  });

  it('la hora de cada pedido: entrega, intento fallido o llegada de su ruta', () => {
    const byCode = Object.fromEntries(report.rows.map((r) => [r.code, r]));
    expect(byCode.S1).toMatchObject({ route: 'Ruta B', driver: 'Kevin Rivas', status: 'Entregado', time: '08:41' });
    expect(byCode.S3).toMatchObject({ status: 'Asignado', time: '07:40' });
    expect(byCode.S4).toMatchObject({ status: 'No entregado', reason: 'Cliente ausente', time: '15:30' });
    expect(byCode.S8).toMatchObject({ zone: 'San Salvador Centro', reason: 'No cabe en el vehículo', time: '' });
    expect(report.rows.map((r) => r.code).slice(0, 3)).toEqual(['S1', 'S2', 'S3']); // S10 después de S9
    expect(report.rows.at(-1).code).toBe('S11');
  });

  it('sin pedidos ni rutas, todo en cero', () => {
    const empty = dayReport({ shipments: [], routes: [], date: DATE, now: NOW });
    expect(empty).toMatchObject({ total: 0, entregados: 0, pendientes: 0, drivers: [], rows: [] });
    expect(empty.noEntregados.byReason).toEqual([]);
  });
});

describe('Excel del reporte', () => {
  const report = dayReport({ shipments, routes, drivers, zones, date: DATE, now: NOW });
  const sheets = reportSheets(report, 'viernes 30 de octubre');

  it('hoja Resumen con los totales y la tabla por motorista; hoja Pedidos con una fila por pedido', () => {
    expect(Object.keys(sheets)).toEqual(['Resumen', 'Pedidos']);
    expect(sheets.Resumen[0]).toEqual(['Reporte del día', 'viernes 30 de octubre']);
    expect(sheets.Resumen).toContainEqual(['No entregados', 3]);
    expect(sheets.Resumen).toContainEqual(['   Cliente ausente', 2]);
    expect(sheets.Resumen).toContainEqual(['Kevin Rivas', 'Ruta B', 'Asignada', 2, 3, 14.7, 3.1, '07:50']);
    expect(sheets.Pedidos[0]).toEqual(['Código', 'Cliente', 'Zona', 'Ruta', 'Motorista', 'Estado', 'Motivo', 'Hora']);
    expect(sheets.Pedidos).toHaveLength(shipments.length + 1);
  });

  it('SheetJS arma y relee el libro con las dos hojas', () => {
    const wb = XLSX.utils.book_new();
    for (const [name, rows] of Object.entries(sheets)) {
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = columnWidths(rows);
      XLSX.utils.book_append_sheet(wb, ws, name);
    }
    const back = XLSX.read(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }), { type: 'array' });
    expect(back.SheetNames).toEqual(['Resumen', 'Pedidos']);
    const pedidos = XLSX.utils.sheet_to_json(back.Sheets.Pedidos);
    expect(pedidos.find((r) => r['Código'] === 'S4')).toMatchObject({
      Estado: 'No entregado',
      Motivo: 'Cliente ausente',
    });
  });

  it('anchos de columna según el texto, con tope', () => {
    expect(columnWidths([['ab', 'una celda bastante larga'], ['abcdefghij']])).toEqual([{ wch: 12 }, { wch: 26 }]);
    expect(columnWidths([['x'.repeat(100)]])).toEqual([{ wch: 48 }]);
    expect(reportFileName(DATE)).toBe('reporte-2026-10-30.xlsx');
  });
});
