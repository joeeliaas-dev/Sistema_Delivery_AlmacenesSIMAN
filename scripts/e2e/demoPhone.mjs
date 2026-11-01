// scripts/e2e/demoPhone.mjs  (dueño: P1)
// Recorre la demo como un usuario en un teléfono de 360 px: toca botones, toma la foto,
// firma con el dedo y escribe la descripción. Usa Chrome por CDP (sin paquetes extra).
// Uso: npm run e2e -- [url]   (por defecto, la vista previa web del equipo)
// Capturas en .e2e/ (ignorada por git). Requiere Google Chrome instalado.
import { join } from 'node:path';
import { PREVIEW_URL, openPhone, root } from './phone.mjs';

const BASE = (process.argv[2] ?? PREVIEW_URL).replace(/\/$/, '');
const phone = await openPhone({ width: 360, height: 780, out: join(root, '.e2e') });
const { send, evaluate, waitFor, tap, typeInto, sign, signInIfAsked, screenshot, consoleErrors } = phone;

const results = [];
async function step(name, fn) {
  const t = Date.now();
  try {
    await fn();
    results.push({ ok: true, name, ms: Date.now() - t });
    console.log(`  ✓ ${name}`);
  } catch (err) {
    results.push({ ok: false, name, error: err.message });
    console.log(`  ✗ ${name}: ${err.message}`);
    await screenshot(`FALLO-${name.replace(/[^a-z0-9]+/gi, '-')}`);
    throw err;
  }
}

// ---------- cambiar de persona (C48) ----------
// Roles estrictos: para ser otra persona se cierra sesión y se entra con su cuenta (con datos de prueba la
// contraseña no se revisa). El despachador sale con "Salir" de su barra; el motorista, desde su menú Más.
const PASS = process.env.TRAZZA_CLAVE ?? 'trazza-prueba';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const lines = async () => ((await evaluate('document.body.innerText')) ?? '').split('\n').map((t) => t.trim());
async function signOutHere() {
  if ((await lines()).includes('Salir')) return tap('Salir');
  await tap('Más');
  await pause(300);
  await tap('Cerrar sesión');
}
async function goMotorista() {
  await send('Page.navigate', { url: `${BASE}/motorista` });
  await waitFor(/Más/);
}
async function actAs(key) {
  await signOutHere();
  await signInIfAsked(`${key}@trazzasv.test`, PASS);
}
async function asDespacho() {
  await signOutHere();
  await signInIfAsked('despacho@trazzasv.test', PASS);
}

// ---------- guion (docs/DEMO.md) ----------
console.log(`Demo en ${BASE} (360 px)`);
let failed = false;
try {
  await step('abre el Centro de despacho con los contadores de partida', async () => {
    await send('Page.navigate', { url: `${BASE}/despacho` });
    // Con Firebase (emulador o nube) pide entrar; con datos de prueba la sesión ya viene puesta (C48)
    await signInIfAsked('despacho@trazzasv.test', process.env.TRAZZA_CLAVE ?? 'trazza-prueba');
    await waitFor('Centro de despacho');
    // Los 51 pendientes: 47 nuevos (por optimizar) + 4 sin asignar (Escalón ya salió)
    await waitFor(/47 nuevos/, '47 nuevos');
    await waitFor(/4 sin asignar/, '4 sin asignar');
    await waitFor(/2 entregados/, '2 entregados');
    const overflow = await evaluate('document.documentElement.scrollWidth > window.innerWidth');
    if (overflow) throw new Error('La página se desborda a lo ancho a 360 px');
    await screenshot('despacho');
  });

  await step('genera la ruta óptima de Z1 (Kevin, con reintentos)', async () => {
    await tap('Todas las zonas'); // abre el selector de zona
    await tap('San Salvador Centro');
    await tap('Generar ruta de esta zona');
    await waitFor('Ruta B', 'Ruta B en las tarjetas', 20000);
    await screenshot('ruta-generada');
  });

  await step('Kevin inicia su ruta', async () => {
    await actAs('kevin');
    await tap('Iniciar ruta');
    await waitFor(/En ruta/);
    await waitFor('Llegué al destino');
    await screenshot('kevin-en-ruta');
  });

  await step('Kevin atiende SIM-0402 fuera de orden (N13) y, en su reintento, vuelve a bodega', async () => {
    // SIM-0402 (12.5 kg) entra en la moto de 40 kg con la grabación real y con el mock; SIM-0401 no siempre (N41)
    await tap('Mauricio Romero'); // SIM-0402 en "Paradas restantes"
    await waitFor('SIM-0402');
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
    await goMotorista();
  });

  await step('Jorge ve la Ruta A del prototipo: 2 de 8, próxima SIM-0419', async () => {
    await actAs('jorge');
    await waitFor(/2 de 8/);
    await waitFor('María Hernández');
    await screenshot('jorge');
  });

  await step('Confirmar entrega exige foto, firma y descripción', async () => {
    await tap('Llegué al destino');
    await waitFor('Resumen de artículos');
    await waitFor(/Falta la foto, la firma y la nota/);
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
    await goMotorista();
    await waitFor(/3 de 8/);
  });

  await step('el Centro de despacho cuenta 3 entregados sin recargar', async () => {
    await asDespacho();
    await waitFor(/3 entregados/, '3 entregados'); // al volver, el selector queda en "Todas las zonas"
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
