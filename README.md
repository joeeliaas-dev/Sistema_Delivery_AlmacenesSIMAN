# Trazza — logística de entregas para Almacenes SIMAN

App web y móvil (Expo + Firebase) con dos roles:

- **Despachador:** importa los pedidos del día desde Excel, revisa las direcciones dudosas, optimiza las rutas con Geoapify (una ruta por zona), reparte lo que no cupo con "Pasar a…", sigue cada ruta y administra a los motoristas.
- **Motorista:** ve su ruta, la inicia y registra cada entrega con foto, firma y nota (o el motivo si no se pudo entregar). Sin señal, lo registrado se guarda en el teléfono y se envía solo al volver la conexión.

En la nube: https://trazzasv.web.app

## Cómo funciona

1. **Importar** (`app/despacho/importar.js`): se lee el Excel, se valida cada fila y se ubica cada dirección (lat/lng del Excel o Geoapify). Lo dudoso queda para **Revisar ubicaciones**.
2. **Optimizar día** (`src/optimizer`): por cada zona, una llamada al Route Planner de Geoapify con los pedidos de la zona y el turno de su motorista. Máximo 25 paradas por ruta; lo que no entra queda "sin asignar" con su motivo (capacidad, horario o sin ubicación).
3. **Guardar** (`src/features/routes/routesService.js`): la ruta, el estado de cada pedido y su motivo se escriben juntos en una sola transacción.
4. **Entregar** (`src/features/shipments/statusMachine.js`): cada cambio de estado sigue la máquina de estados (pendiente → asignado → en ruta → entregado / no entregado → reintento o devuelto) y guarda la evidencia.
5. **Límite de llamadas:** `GEOAPIFY_DAILY_LIMIT` (`src/constants.js`) y el aviso "Rutas al día": no se vuelve a optimizar si no hay pedidos nuevos.

## Estructura

| Carpeta | Qué hay |
| --- | --- |
| `app/` | Pantallas (expo-router): `login`, `despacho/` (centro, importar, ubicaciones, motoristas, seguimiento de ruta), `motorista/`, `entrega/` |
| `src/features/` | Una carpeta por tema: `routes`, `shipments`, `orders` (Excel), `geo` (ubicación), `zones`, `dispatch` (piezas del despacho), `driver` (piezas del motorista), `drivers` y `fleet` (motoristas), `evidence` (foto, firma, GPS), `importer`, `review`, `catalog`, `session` |
| `src/optimizer/` | Traductor a Geoapify (`geoapify.js`) y armado del día (`index.js`) |
| `src/config/` | Zonas, depósito y reglas de ruteo (máximo de paradas) |
| `src/lib/` | Firebase, sesión y roles (`auth.js`), Geoapify con su límite, bandeja sin señal (`outbox.js`), escrituras en lote (`writer.js`) |
| `src/components/`, `src/theme/` | Botones, tarjetas, mapas y el tema visual |
| `scripts/cloud/` | Compilar, recargar datos y publicar en la nube |
| `firestore.cloud.rules` | Reglas de seguridad de la nube (por rol: despacho / motorista) |
| `siman-pruebas/` | Pruebas unitarias (Jest), de emulador y de navegador; `correr.mjs` las copia dentro de la app mientras corren |
| `Sprint 1/` | Prototipo del Sprint 1 (HTML/JS), ya no se publica desde el CI |
| `docs/` | Decisiones de arquitectura (`adr/`) y el documento de funcionamiento |

## Arranque

```bash
npm install
npm start          # Expo; npm run web para el navegador
```

La app trabaja siempre contra Firebase: corrida en local escribe en los mismos datos que trazzasv.

Configuración local (no se sube, está en `.gitignore`): copia `.env.example` a `.env` y `scripts/cloud/cloudConfig.example.json` a `scripts/cloud/cloudConfig.json`; los secretos (`EXPO_PUBLIC_GEOAPIFY_KEY`, `TRAZZA_CLAVE_CUENTAS`) van en `.env.local`.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm start` / `npm run web` | Servidor de Expo / versión web |
| `npm run lint` | ESLint |
| `npm run pruebas -- unidad` | Pruebas sin servidor; también `emulador`, `navegador` y `emuladores` (viven en `siman-pruebas/`) |
| `npm run build:cloud` | Compila la versión para la nube en `dist-cloud/` |
| `npm run seed:cloud` | Recarga los datos de prueba del día y sube las reglas |
| `npm run release:cloud` | Pruebas, compilación, hosting, datos, reglas y chequeo de humo, en orden (`-- --solo-revisar` para ensayar sin subir) |

Todos los comandos de Firebase usan `--config` (`firebase.cloud.json` para publicar, `firebase.cloud-seed.json` para la carga de datos). El proyecto por defecto de `.firebaserc` es `proyecto-mad-9bdd2`; el del prototipo queda con el alias `sprint1`.

## CI

`.github/workflows/ci.yml` corre en cada push y pull request a `main`: comprueba que no se suban claves (`.env`, `.env.local`, `cloudConfig.json`), revisa los JSON, instala, corre `npm run lint`, las pruebas unitarias (`npm run pruebas -- unidad`) y compila la versión web. **No publica**: la publicación en trazzasv se hace a mano con `npm run release:cloud`.

## Reglas del equipo

- Ninguna pantalla escribe directo en Firestore: todo pasa por los servicios de `src/features`.
- Cada archivo tiene un dueño (primera línea). Solo P1 instala paquetes.
- Claves y configuración real nunca van al repositorio.
