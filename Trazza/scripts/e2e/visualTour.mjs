import { join, resolve } from 'node:path';
import { PREVIEW_URL, openPhone, root, sleep } from './phone.mjs';
const BASE = (process.argv[2] ?? PREVIEW_URL).replace(/\/$/, '');
const OUT = resolve(process.argv[3] ?? join(root, '.tour'));
const phone = await openPhone({
  width: 390,
  height: 1500,
  out: OUT,
});
const { navigate, waitFor, tap, typeInto, sign, scrollTop, screenshot, evaluate } = phone;
const shot = async (name) => {
  await scrollTop();
  await sleep(500);
  await screenshot(name);
};
try {
  await navigate(`${BASE}/despacho`);
  await waitFor('Centro de despacho');
  await tap('San Salvador Centro');
  await tap('Generar ruta óptima');
  await waitFor('Ruta B', 'ruta generada', 20000);
  await tap('Motorista');
  await tap('Kevin');
  await waitFor('Iniciar ruta');
  await shot('motorista-asignada');
  await tap('Daniela');
  await waitFor('Sin ruta para hoy');
  await shot('motorista-sin-ruta');
  await tap('Jorge');
  await waitFor(/2 de 8/);
  await shot('motorista-en-ruta');
  await tap('Llegué al destino');
  await waitFor('Resumen de artículos');
  await shot('confirmar-vacio');
  await tap('Tomar foto');
  await sleep(800);
  await sign();
  await typeInto('textarea', 'Recibió la clienta en la puerta principal');
  await shot('confirmar-lleno');
  await tap('Completar entrega');
  await waitFor('Entrega completada', 'éxito', 20000);
  await shot('confirmar-exito');
  await tap('Siguiente parada');
  await waitFor(/3 de 8/);
  await tap('Llegué al destino');
  await waitFor('Resumen de artículos');
  await tap('No se pudo entregar');
  await waitFor('Motivo');
  await shot('no-entregado-vacio');
  await tap('Cliente ausente');
  await tap('Tomar foto');
  await sleep(800);
  await typeInto('textarea', 'Nadie abrió; se llamó dos veces al cliente');
  await shot('no-entregado-lleno');
  await tap('Registrar no entrega');
  await waitFor('Se programó un reintento', 'reintento', 20000);
  await shot('no-entregado-resultado');
  await tap('Siguiente parada');
  await waitFor(/4 de 8/);
  await evaluate(
    `(() => { const el = [...document.querySelectorAll('*')].find((e) => (e.innerText || '').trim() === 'Paradas restantes'); el?.scrollIntoView(); })()`,
  );
  await sleep(400);
  await screenshot('motorista-lista');
  console.log(`Capturas en ${OUT}`);
} catch (err) {
  await screenshot('FALLO');
  console.error(err.message);
  process.exitCode = 1;
} finally {
  phone.close();
}
