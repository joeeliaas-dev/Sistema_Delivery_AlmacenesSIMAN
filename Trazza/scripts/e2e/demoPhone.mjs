import { join } from 'node:path';
import { PREVIEW_URL, openPhone, root } from './phone.mjs';
const BASE = (process.argv[2] ?? PREVIEW_URL).replace(/\/$/, '');
const phone = await openPhone({
  width: 360,
  height: 780,
  out: join(root, '.e2e'),
});
const { send, evaluate, waitFor, tap, typeInto, sign, screenshot, consoleErrors } = phone;
const results = [];
async function step(name, fn) {
  const t = Date.now();
  try {
    await fn();
    results.push({
      ok: true,
      name,
      ms: Date.now() - t,
    });
    console.log(`  ✓ ${name}`);
  } catch (err) {
    results.push({
      ok: false,
      name,
      error: err.message,
    });
    console.log(`  ✗ ${name}: ${err.message}`);
    await screenshot(`FALLO-${name.replace(/[^a-z0-9]+/gi, '-')}`);
    throw err;
  }
}
console.log(`Demo en ${BASE} (360 px)`);
let failed = false;
try {
  await step('abre el Centro de despacho con los contadores de partida', async () => {
    await send('Page.navigate', {
      url: `${BASE}/despacho`,
    });
    await waitFor('Centro de despacho');
    await waitFor(/51\s*Pendientes/, 'Pendientes 51');
    await waitFor(/2\s*Entregados/, 'Entregados 2');
    const overflow = await evaluate('document.documentElement.scrollWidth > window.innerWidth');
    if (overflow) throw new Error('La página se desborda a lo ancho a 360 px');
    await screenshot('despacho');
  });
  await step('genera la ruta óptima de Z1 (Kevin, con reintentos)', async () => {
    await tap('San Salvador Centro');
    await tap('Generar ruta óptima');
    await waitFor('Ruta B', 'Ruta B en las tarjetas', 20000);
    await screenshot('ruta-generada');
  });
  await step('Kevin inicia su ruta', async () => {
    await tap('Motorista');
    await tap('Kevin');
    await tap('Iniciar ruta');
    await waitFor(/En ruta/);
    await waitFor('Llegué al destino');
    await screenshot('kevin-en-ruta');
  });
  await step('Kevin atiende SIM-0401 fuera de orden (N13) y, en su reintento, vuelve a bodega', async () => {
    await tap('Oscar Molina');
    await waitFor('SIM-0401');
    await tap('No se pudo entregar');
    await waitFor('Motivo');
    await waitFor('Este es el reintento');
    await tap('Dirección incorrecta');
    await tap('Tomar foto');
    await evaluate('new Promise((r) => setTimeout(r, 800))');
    await typeInto('textarea', 'La dirección no existe, nadie conoce al cliente');
    await tap('Registrar no entrega');
    await waitFor('El envío vuelve a bodega', 'mensaje de devuelto', 20000);
    await screenshot('devuelto');
    await tap('Motorista');
  });
  await step('Jorge ve la Ruta A del prototipo: 2 de 8, próxima SIM-0419', async () => {
    await tap('Jorge');
    await waitFor(/2 de 8/);
    await waitFor('María Hernández');
    await screenshot('jorge');
  });
  await step('Confirmar entrega exige foto, firma y descripción', async () => {
    await tap('Llegué al destino');
    await waitFor('Resumen de artículos');
    await waitFor(/Falta: foto, firma, descripción/);
    await tap('Tomar foto');
    await evaluate('new Promise((r) => setTimeout(r, 800))');
    await sign();
    await typeInto('textarea', 'Corta');
    await waitFor(/Falta: descripción|faltan/i, 'aviso de descripción corta');
    await typeInto('textarea', ' — recibió la clienta en la puerta');
    await screenshot('evidencia-completa');
  });
  await step('completar entrega y ver el éxito', async () => {
    await tap('Completar entrega');
    await waitFor('Entrega completada', 'pantalla de éxito', 20000);
    await screenshot('entrega-completada');
  });
  await step('la Vista motorista pasa a 3 de 8', async () => {
    await tap('Motorista');
    await waitFor(/3 de 8/);
  });
  await step('el Centro de despacho cuenta 3 entregados sin recargar', async () => {
    await tap('Despacho');
    await tap('Todas las zonas');
    await waitFor(/3\s*Entregados/, 'Entregados 3');
    await screenshot('despacho-final');
  });
} catch {
  failed = true;
}
const errors = consoleErrors.filter((e) => e && !/favicon|DevTools/.test(e));
console.log(
  `\n${results.filter((r) => r.ok).length}/${results.length} pasos · errores en consola: ${errors.length} · capturas en .e2e/`,
);
errors.slice(0, 5).forEach((e) => console.log(`  consola: ${String(e).slice(0, 200)}`));
phone.close();
process.exit(failed || errors.length ? 1 : 0);
