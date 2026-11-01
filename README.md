# Siman Logística — Sprint 1

App móvil (Expo + Firebase) con las 3 vistas del prototipo: **Centro de despacho**, **Vista motorista** y **Confirmar entrega**. Todo corre con datos de prueba; sin login ni roles.

La fuente de verdad es el documento **Plan Técnico Sprint 1**: contrato, modelo de datos, estados y dueños de cada archivo.

## Requisitos

| Herramienta | Versión | Para qué |
| --- | --- | --- |
| Node.js | 24 | Todo el proyecto |
| Java (JDK) | 21 o más | Emuladores de Firebase |
| Firebase CLI | 15 o más (`npm i -g firebase-tools`) | Emuladores y vista previa web |
| Expo Go | La de SDK 57, en un **Android** | Probar en el teléfono (en iPhone usar `eas go` o el simulador) |

## Arranque rápido (modo mocks, 5 min)

```bash
npm install
npm start
```

Escanea el QR con Expo Go. La app abre en el Centro de despacho con los datos de `src/mocks/` y muestra la etiqueta "DATOS DE PRUEBA · mocks". En este modo **también se puede entregar**. En el teléfono los cambios viven en memoria; en web se guardan en el navegador de cada dispositivo. "Reiniciar datos", arriba, vuelve al inicio.

Cómo se prueba en Android y iPhone, y todo lo que cambió respecto al documento del plan: [docs/DECISIONES.md](docs/DECISIONES.md).

Para verla en el navegador: `npm run web`.

## Con el emulador de Firebase (datos persistentes)

1. En una terminal, deja corriendo los emuladores:
   ```bash
   npm run emulators
   ```
   Panel del emulador: http://localhost:4000
2. En otra terminal, siembra los datos (60 envíos con fecha de hoy y la Ruta A del prototipo):
   ```bash
   npm run seed -- --reset
   ```
   `--reset` borra todo y vuelve a sembrar; úsalo cada vez que quieras repetir la demo.
3. En `.env` cambia `EXPO_PUBLIC_USE_MOCKS=false` y reinicia con `npx expo start -c`.

El teléfono busca los emuladores en la misma IP de la PC que usa Metro. Si no conecta:
- El teléfono y la PC deben estar en la misma red Wi-Fi.
- Abre en el firewall de Windows los puertos **8080** (Firestore) y **9199** (Storage).
- O fija la IP en `.env`: `EXPO_PUBLIC_EMULATOR_HOST=192.168.x.x`.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm start` | Servidor de Expo (QR para Expo Go) |
| `npm test` | Pruebas unitarias en modo mocks (optimizador, máquina de estados, zonas, servicios) |
| `npm run test:emulator` | Siembra y corre el flujo completo contra el emulador (requiere `npm run emulators`) |
| `npm run e2e` | Recorre la demo como usuario en un teléfono de 360 px (Chrome sin pantalla): genera e inicia ruta, toma la foto, firma, completa la entrega y revisa contadores. Capturas en `.e2e/`. Acepta otra URL: `npm run e2e -- http://localhost:8081` |
| `npm run e2e:emulator` | La misma demo con la app conectada al emulador (sin mocks): compila, reinicia el seed y verifica escrituras reales. Requiere `npm run emulators`. Después, arranca con `npx expo start -c`: la caché de Metro guarda el valor de `EXPO_PUBLIC_USE_MOCKS` |
| `npm run tour` | Capturas de cada estado de las pantallas del repartidor en tamaño iPhone (390 px) en `.tour/`. Acepta `-- <url> <carpeta>` |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |
| `npm run seed -- --reset` | Reinicia los datos del emulador |
| `npm run mocks` | Regenera `src/mocks/*.json` desde `scripts/data/buildDataset.mjs` |
| `npm run deploy:preview` | Publica la versión web en la vista previa del equipo (requiere acceso al proyecto de Firebase) |

Vista previa web del equipo (modo mocks): https://trazza-web--sprint1-wpxlt7vs.web.app

## En la nube (Firebase, proyecto-mad-9bdd2)

- **App:** https://trazzasv.web.app — conectada a Firestore en la nube; todos ven los mismos datos. (`trazza-web.web.app` redirige aquí.)
- **Publicar una versión nueva:** `npm run deploy:live` (compila sin mocks en `dist-cloud/` y publica).
- **Recargar los datos de prueba** (con la fecha de hoy): `npm run seed:cloud`. Pone reglas de carga temporales, carga y restaura las reglas limitadas; tarda unos 3 minutos.
- **Comprobar las reglas:** `npm run check:cloud` (intenta 17 escrituras prohibidas, sin cambiar datos).
- **Reglas:** `firestore.cloud.rules` y `storage.cloud.rules` (sin login, escritura limitada). Las del emulador (`firestore.rules`) son abiertas y nunca se suben a la nube.
- **Fotos y firmas:** se guardan comprimidas en Firestore (`evidence/`, plan Spark gratis, N35). Si algún día se activa Blaze: `firebase deploy --config firebase.cloud.json --only storage --project proyecto-mad-9bdd2` y publicar con `node scripts/cloud/buildCloud.mjs --storage`.

## Datos de prueba

| Estado | Cantidad | Dónde |
| --- | --- | --- |
| pendiente | 49 | Repartidos en las 5 zonas |
| en_ruta | 6 | Ruta A de Z2, Jorge Martínez (D2) |
| entregado | 2 | Ruta A de Z2 |
| no_entregado | 2 | Z1, listos para reintento (SIM-0401, SIM-0402) |
| devuelto | 1 | Z4 (SIM-0437) |

Motoristas: D1 Kevin Rivas (Z1), D2 Jorge Martínez (Z2), D3 Daniela Flores (Z3), D4 Mario Castro (Z4), D5 Sofía Guzmán (Z5). Todos los datos son ficticios.

## Reglas del equipo (resumen)

- Cada archivo tiene **un solo dueño** (el comentario de la primera línea lo dice). Si necesitas algo en un archivo ajeno, pídelo; no lo edites.
- **Ninguna pantalla escribe en Firestore.** Los cambios de estado pasan por `changeStatus`, `changeStatusMany` o `assignToRoute` (`src/features/shipments/statusMachine.js`), y las rutas se crean con `createRoute` (`src/features/routes/routesService.js`).
- Las pantallas tampoco importan `src/mocks/`: leen con los `listen*` de los servicios. Así, cambiar de mocks a emulador no toca ninguna pantalla.
- **Solo P1 instala paquetes.** No corras `npm install <paquete>`, `npx expo install` ni `npx expo lint`, porque modifican `package.json`.
- Windows no distingue mayúsculas de minúsculas en los nombres de archivo: `RouteProgress.js` y `routeProgress.js` son **el mismo archivo**. No uses dos nombres que solo cambien en eso.

## Problemas comunes

- **`npm install` se queda colgado o da `ENOENT`:** otra instalación usa la misma caché. Usa una caché propia: `npm install --cache ./.npm-cache`.
- **Jest dice `Unexpected token 'export'` en firebase:** ya está resuelto en `jest.setup.js`, que simula Firebase en todas las pruebas. No hace falta repetir los `jest.mock`.
- **La firma no aparece en la web:** `react-native-signature-canvas` usa WebView, que solo existe en el teléfono; en web se usa `SignaturePad.web.js`.
- **Los mapas no aparecen en la web:** `react-native-maps` no existe en web; ahí se ve la lista de `RouteMap.web.js`.
