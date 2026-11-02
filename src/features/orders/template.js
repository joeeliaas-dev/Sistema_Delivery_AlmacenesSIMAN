// src/features/orders/template.js  (dueño: P1)
// Descarga plantilla-pedidos.xlsx con las columnas de la plantilla y una fila de ejemplo (solo web).
import * as XLSX from 'xlsx';
import { todayISO } from '../../lib/dates';
import { COLUMNS, TEMPLATE_EXAMPLE } from './columns';

/** Libro de la plantilla (también lo usa scripts/make-orders-xlsx.js). */
export function buildTemplateBook(date = todayISO()) {
  const sheet = XLSX.utils.json_to_sheet([{ ...TEMPLATE_EXAMPLE, fecha: date }], { header: COLUMNS });
  sheet['!cols'] = COLUMNS.map((c) => ({ wch: ['direccion', 'referencia'].includes(c) ? 36 : 14 }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Pedidos');
  return book;
}

/** Descarga la plantilla en el navegador. */
export function downloadTemplate() {
  XLSX.writeFile(buildTemplateBook(), 'plantilla-pedidos.xlsx');
}
