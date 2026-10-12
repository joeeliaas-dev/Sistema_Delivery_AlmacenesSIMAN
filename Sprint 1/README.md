# Siman Delivery · Sprint 1

Aplicación de entregas con **HTML, CSS y JavaScript**, diseñada primero para celulares. Los datos viven en **Firebase (Cloud Firestore)**; ya no hay backend Flask ni Python. Incluye seis pedidos ficticios de Ciudad de Guatemala, todos inicialmente `pendiente`.

**En línea:** https://siman-delivery-app.web.app

## Ejecutar en tu computadora

No hay nada que instalar. Sirve la carpeta `Sprint 1` con cualquier servidor estático y abre la dirección que indique. Por ejemplo, desde la raíz del repositorio:

```powershell
npx serve "Sprint 1"
```

También funciona la extensión **Live Server** de VS Code sobre `Sprint 1/index.html`. Abrir el archivo con doble clic (`file://`) no funciona, porque el navegador no carga módulos de JavaScript desde archivos locales.

La versión local usa la misma base de datos en línea que el sitio publicado.

## Qué hace la pantalla

- Muestra ID, cliente, dirección, paquete, horario y estado de cada entrega.
- **Fallido** y **Entregado** guardan el estado directamente en Firestore; la tarjeta se actualiza después de la confirmación, sin recargar la página.
- Bloquea los botones de ese pedido mientras guarda para evitar clics duplicados. El resultado seleccionado queda deshabilitado; el otro botón permite corregirlo.
- Actualiza los contadores, las visitas registradas y la próxima entrega pendiente.
- Permite buscar por ID, cliente o dirección, incluyendo nombres sin tildes, y filtrar por estado.
- Incluye carga, lista vacía, error, reintento, navegación por teclado y avisos accesibles.

El avance cuenta **visitas con resultado** (`entregado` + `fallido`), no solamente entregas exitosas. El dibujo de la ruta es ilustrativo.

## Estructura

```text
Sprint 1/
  index.html                     # Pantalla y plantilla de tarjeta
  static/css/styles.css          # Diseño mobile-first, sin frameworks
  static/js/app.js               # Estados, búsqueda y filtros
  static/js/firebase.js          # Conexión con Firebase: listar pedidos y guardar su estado
  static/favicon.svg
  datos/pedidos-de-prueba.json   # Los seis pedidos iniciales
  herramientas/reiniciar-pedidos.mjs  # Vuelve todos los pedidos a "pendiente"
  PRUEBAS.md
firebase.json, .firebaserc       # Proyecto de Firebase y publicación (Hosting)
firestore.rules                  # Reglas de la base de datos
```

## Datos en Firebase

Colección `pedidos`, un documento por pedido con su número como id (`pedidos/10481`):

```json
{
  "id": 10481,
  "cliente": "María Fernanda López",
  "direccion": "12 calle 6-25, zona 10, Ciudad de Guatemala",
  "estado": "pendiente",
  "zona": "Zona 10",
  "paquete": "Hogar · 2 paquetes",
  "ventana": "09:00 – 12:00"
}
```

`firebase.js` expone las mismas dos operaciones que tenía la API Flask:

- `listarPedidos()`: todos los pedidos, en orden por `id`.
- `actualizarEstadoPedido(id, estado)`: `estado` acepta exclusivamente `entregado` o `fallido`; devuelve el pedido actualizado. Si el pedido no existe, avisa con "No se encontró el pedido solicitado."

**Reglas (`firestore.rules`):** sin inicio de sesión, para pruebas del equipo. Se pueden leer los pedidos y cambiar solo su `estado`; no se pueden crear, borrar ni modificar otros campos. Cualquier otra colección está cerrada.

## Reiniciar la prueba

Para volver todos los pedidos a `pendiente` (Node 18 o superior):

```powershell
node "Sprint 1/herramientas/reiniciar-pedidos.mjs"
```

## Publicar

Con acceso al proyecto de Firebase y [Firebase CLI](https://firebase.google.com/docs/cli):

```powershell
firebase deploy --only hosting          # la página
firebase deploy --only firestore:rules  # las reglas
```

Los escenarios y la comprobación visual del Sprint 1 están documentados en `PRUEBAS.md`.
