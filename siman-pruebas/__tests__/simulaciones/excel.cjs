// __tests__/simulaciones/excel.cjs  (dueño: P1)
// pedidos-prueba-100.xlsx trae una fecha fija: las pruebas la cambian por la de mañana al leerlo,
// así no dependen del día en que se corren (la fila sin fecha se deja vacía: es uno de los 4 errores).
function paraManana(rows) {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const manana = d.toLocaleDateString('en-CA');
  return rows.map((r) => (r.fecha ? { ...r, fecha: manana } : r));
}

module.exports = { paraManana };
