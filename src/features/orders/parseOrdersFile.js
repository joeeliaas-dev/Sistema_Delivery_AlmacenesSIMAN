// src/features/orders/parseOrdersFile.js  (dueño: P1)
// Lee .xlsx o .csv en el propio navegador (SheetJS). No valida: eso es validateOrders.
import * as XLSX from 'xlsx';

/**
 * @param {File|Blob|ArrayBuffer|Uint8Array} file  primera hoja del libro
 * @returns {Promise<{ headers: string[], rows: Array<object> }>}
 *   rows: un objeto por fila con los encabezados originales como llaves y __row (número de fila del Excel)
 */
export async function parseOrdersFile(file) {
  const data = file instanceof ArrayBuffer || ArrayBuffer.isView(file) ? file : await file.arrayBuffer();
  const bytes =
    data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  // .xlsx es un ZIP ("PK") y .xls un archivo OLE (D0 CF); lo demás es texto (CSV): se lee como UTF-8,
  // con o sin BOM, para que "Portón" no salga como "PortÃ³n"
  const isBinary = (bytes[0] === 0x50 && bytes[1] === 0x4b) || (bytes[0] === 0xd0 && bytes[1] === 0xcf);
  const book = isBinary
    ? XLSX.read(bytes, { type: 'array', cellDates: true })
    : XLSX.read(new TextDecoder('utf-8').decode(bytes).replace(/^﻿/, ''), { type: 'string', cellDates: true });
  const sheet = book.Sheets[book.SheetNames[0]];
  if (!sheet) return { headers: [], rows: [] };
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
  const [head = [], ...body] = matrix;
  const headers = head.map((h) => String(h).trim());
  const rows = [];
  body.forEach((cells, i) => {
    if (!cells.some((c) => String(c).trim() !== '')) return; // filas vacías
    const row = { __row: i + 2 };
    headers.forEach((h, j) => {
      if (h) row[h] = cells[j] ?? '';
    });
    rows.push(row);
  });
  return { headers, rows };
}
