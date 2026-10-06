# Siman Delivery · Sprint 1

Aplicación de entregas con **Flask, HTML, CSS y JavaScript**, diseñada primero para celulares. Incluye seis pedidos ficticios de Ciudad de Guatemala, todos inicialmente `pendiente`.

## Ejecutar en Windows

Desde PowerShell, en la carpeta del proyecto:

```powershell
.\iniciar.ps1
```

El script crea `.venv` si hace falta, instala Flask y ejecuta la aplicación. Si PowerShell no permite ejecutar scripts, usa los comandos de instalación manual de abajo.

Abre **http://127.0.0.1:5000**. Detén el servidor con `Ctrl+C`.

### Instalación manual (Python 3.10 o superior)

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe app.py
```

En macOS/Linux, usa `python3` y `.venv/bin/python` en lugar de las rutas de Windows.

Para probar desde tu teléfono conectado a la misma red, inicia Flask con:

```powershell
.\.venv\Scripts\python.exe -m flask --app app run --host=0.0.0.0
```

Abre `http://IP_LOCAL_DE_TU_PC:5000` en el teléfono. La red y el firewall deben permitir la conexión. Usa este modo para pruebas en una red de confianza, sin habilitar el depurador.

## Qué hace la pantalla

- Muestra ID, cliente, dirección, paquete, horario y estado de cada entrega.
- **Fallido** y **Entregado** envían un `PATCH` con Fetch; la tarjeta se actualiza después de la confirmación del servidor, sin recargar la página.
- Bloquea los botones de ese pedido mientras guarda para evitar clics duplicados. El resultado seleccionado queda deshabilitado; el otro botón permite corregirlo.
- Actualiza los contadores, las visitas registradas y la próxima entrega pendiente.
- Permite buscar por ID, cliente o dirección, incluyendo nombres sin tildes, y filtrar por estado.
- Incluye carga, lista vacía, error, reintento, navegación por teclado y avisos accesibles.

El avance cuenta **visitas con resultado** (`entregado` + `fallido`), no solamente entregas exitosas. El dibujo de la ruta es ilustrativo.

## Estructura

```text
app.py                    # Rutas Flask y respuestas HTTP
pedidos.py                # Lista de diccionarios y funciones de acceso a datos
templates/index.html      # Pantalla y plantilla de tarjeta
static/css/styles.css     # Diseño mobile-first, sin frameworks
static/js/app.js           # Fetch, estados, búsqueda y filtros
static/favicon.svg
tests/test_api.py          # Pruebas de contrato y almacenamiento
requirements.txt
iniciar.ps1
PRUEBAS.md
```

## Contrato de la API

### `GET /api/pedidos`

Devuelve `200` y todos los pedidos:

```json
{
  "pedidos": [
    {
      "id": 10481,
      "cliente": "María Fernanda López",
      "direccion": "12 calle 6-25, zona 10, Ciudad de Guatemala",
      "estado": "pendiente",
      "zona": "Zona 10",
      "paquete": "Hogar · 2 paquetes",
      "ventana": "09:00 – 12:00"
    }
  ]
}
```

### `PATCH /api/pedidos/<id>/estado`

Encabezado `Content-Type: application/json`. Cuerpo:

```json
{"estado": "entregado"}
```

`estado` acepta exclusivamente `entregado` o `fallido`. Devuelve `200` y `{"pedido": {...}}` con el pedido completo actualizado. Repetir el mismo estado es válido y no altera otros pedidos.

Errores: `400` para JSON o estado inválido, `404` para un pedido inexistente, `415` para un tipo de contenido incorrecto. Las respuestas de la API usan `{"error": "mensaje"}` y `Cache-Control: no-store`.

## Integración posterior con Firebase

Tu compañero debe sustituir el almacenamiento **solamente en `pedidos.py`**, donde están los comentarios `# TODO: Reemplazar con Firebase`:

1. `listar_pedidos() -> list[dict]`: leer la colección `pedidos`, convertir los documentos a diccionarios y mantener un orden estable.
2. `actualizar_estado_pedido(pedido_id: int, estado: str) -> dict | None`: actualizar el documento y devolver sus campos completos; devolver `None` si no existe. Mantener la validación de estados.

Mantener `id` como entero único, `cliente`, `direccion` y `estado` como cadenas. `paquete` y `ventana` son opcionales en el frontend y tienen texto de respaldo. Si los documentos de Firebase usan identificadores de texto, conservar un campo `id` numérico para este contrato. Mantener las rutas y las envolturas `pedidos`/`pedido` permite conectar Firebase **sin cambiar HTML, CSS o JavaScript**. Configurar las credenciales del servidor fuera del repositorio.

**La base actual es una lista en memoria:** conserva los cambios al recargar el navegador, pero al reiniciar Python todos los pedidos vuelven a `pendiente`. Cada proceso tiene su propia lista; ejecutar un solo proceso para esta simulación. Firebase todavía no está conectado.

## Pruebas

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

No requiere instalar un framework adicional. Los escenarios y la comprobación visual del Sprint 1 están documentados en `PRUEBAS.md`.

Referencia de ejecución, rutas y plantillas: [documentación oficial de Flask](https://flask.palletsprojects.com/en/stable/quickstart/).
