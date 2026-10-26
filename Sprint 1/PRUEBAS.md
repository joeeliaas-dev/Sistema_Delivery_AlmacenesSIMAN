# Verificación del Sprint 1

Comprobación realizada el **6 de octubre de 2026** con Flask 3.1.3, Python 3.12 y el navegador integrado de Codex.

## Requisitos de aceptación

| Historia | Resultado esperado | Resultado observado |
| --- | --- | --- |
| HU-3 | Pantalla móvil con lista de entregas | Se muestran seis tarjetas con ID, cliente, dirección y estado inicial pendiente. |
| HU-4 | Botones Fallido y Entregado por pedido | Ambos botones aparecen en cada tarjeta, con un área de toque de al menos 44 px de alto. |
| HU-5 | Clics actualizan el pedido y el sistema | Fetch envía PATCH; Flask confirma y la tarjeta, contadores y avance cambian sin recargar la página. |

## Pruebas automatizadas

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

**Resultado: 10 pruebas aprobadas.** Cubren:

1. Pedidos de prueba pendientes, campos obligatorios e IDs únicos.
2. Guardado de entregado y fallido, sin modificar otros pedidos.
3. Repetición y corrección de estados.
4. Rechazo de estados inválidos y cuerpos JSON de tipos incorrectos, sin mutaciones.
5. Pedido inexistente (`404`).
6. JSON malformado (`400`) y tipo de contenido incorrecto (`415`).
7. Protección de la lista interna frente a cambios en los diccionarios devueltos.
8. Validación de la función de almacenamiento y pedido inexistente.
9. Pantalla HTML y recursos CSS, JavaScript y favicon servidos por Flask.
10. Fallo del almacenamiento (`500`) con respuesta JSON, sin exponer detalles internos.

También se verificó la sintaxis de JavaScript con `node --check static/js/app.js`, la sintaxis del script PowerShell, `pip check` y `git diff --check`.

## Pruebas realizadas en el navegador

| Escenario | Resultado |
| --- | --- |
| Marcar #10481 como Entregado | Tarjeta verde con texto Entregado; 5 pendientes, 1 entregado, 0 fallidos. |
| Marcar #10482 como Fallido | Tarjeta con texto Fallido; 4 pendientes, 1 entregado, 1 fallido; avance 2 de 6 visitas. |
| Recargar la página | Los estados registrados se mantienen mientras el servidor sigue encendido. |
| Corregir #10482 con Enter | Fallido → Entregado → Fallido; el foco queda en el botón de la otra opción. |
| Filtrar Entregados | Solo se muestra #10481. |
| Filtrar Fallidos | Solo se muestra #10482. |
| Buscar `sofia` | Encuentra Sofía Hernández aun sin escribir la tilde. |
| Buscar un cliente inexistente | Aparece el estado sin resultados. |
| Detener Flask e intentar marcar #10483 | La tarjeta conserva pendiente, muestra un error y vuelve a habilitar sus botones. |
| Actualizar con Flask detenido | Aparece el error de consulta y el botón Volver a intentar. |
| Reiniciar Flask y pulsar Volver a intentar | Se recupera la lista y la conexión aparece En línea. Los seis pedidos vuelven a pendiente por tratarse de almacenamiento en memoria. |

Los registros de Flask confirmaron `PATCH /api/pedidos/10481/estado` y `PATCH /api/pedidos/10482/estado` con código `200`, sin solicitudes nuevas a la página HTML durante los clics. Una consulta posterior a `GET /api/pedidos` confirmó los estados guardados en el backend.

## Diseño adaptable y accesibilidad

Se probaron anchos de viewport de **320, 390, 768, 1024 y 1440 px**. En todos, el ancho del contenido coincide con el espacio disponible: no hay desbordamiento horizontal. La barra vertical del navegador ocupa 15 px; por ejemplo, un viewport de 390 px deja 375 px para el documento.

- Una columna de tarjetas en celular y tableta; dos columnas desde 1024 px.
- Resumen de ruta compacto en celular y panel lateral en pantallas amplias.
- Botones de estado de 44 px de alto como mínimo.
- Búsqueda con tamaño de texto de 16 px en móvil para evitar el zoom automático del campo en iOS.
- Estructura de encabezados, controles con nombres accesibles, estados mediante texto e iconos, avisos `aria-live`, foco visible y respeto por movimiento reducido.
- Los 46 iconos decorativos se verificaron como `aria-hidden`.
- Sin advertencias o errores de consola durante el funcionamiento conectado. Las pruebas de desconexión provocan los errores de red esperados del navegador.

La revisión se realizó en navegador de escritorio con viewport móvil; no se probó un teléfono físico ni se ejecutó un lector de pantalla o una auditoría automática de accesibilidad.

## Evidencia visual

Las capturas se guardaron localmente en `artifacts/`, fuera del historial Git:

- [Vista móvil, 390 × 844](artifacts/movil.jpg).
- [Vista de escritorio, 1440 × 900](artifacts/escritorio.jpg).
- [Fallo de conexión durante el guardado](artifacts/error-conexion.jpg).

Las primeras dos capturas muestran los estados Entregado y Fallido producidos durante las pruebas. Después se reinició Flask para dejar la aplicación con sus seis pedidos pendientes.

## Reproducir la demostración

1. Ejecutar `.\iniciar.ps1` y abrir `http://127.0.0.1:5000`.
2. Presionar Entregado en el primer pedido y Fallido en el segundo.
3. Comprobar los estados y el avance 2 de 6 visitas.
4. Usar los filtros para ver cada grupo de pedidos.
5. Recargar y confirmar que los estados se mantienen.
6. Detener y reiniciar Flask: todos regresan a pendiente, conforme a la simulación en memoria.
