# ADR 0003 · Capa intermedia para ingesta de pedidos de Siman
Estado: Aceptada · 20 de octubre de 2026 · Pendiente de implementar (ver nota del 3 de noviembre de 2026)

Contexto
Para el Sprint 4, el sistema debe recibir el flujo de pedidos desde el API de Almacenes Siman, pero actualmente tenemos información insuficiente sobre cómo enviarán los datos o con qué frecuencia cambiarán su formato [40]. Darles acceso directo a la base de datos es un riesgo alto (puerta de una vía sin información suficiente) [32, 40].

Decisión
Crearemos un microservicio intermedio (Cloud Function) que reciba el payload de Siman, lo procese y lo guarde en nuestra base de datos. Descartamos permitir que el sistema externo de Siman escriba directamente en nuestra colección de Firebase [40].

Consecuencias

Aislamiento del riesgo: Si Siman altera la estructura de sus datos, nuestra arquitectura central queda a salvo; solo se modifica la Cloud Function [40].

Mantenemos el control estricto sobre las reglas de seguridad de escritura en Firebase.

Agrega un nuevo componente de infraestructura que el equipo debe aprender a desarrollar, monitorear y desplegar.

Añade unos milisegundos de latencia en la creación inicial del pedido.

Nota de implementación (3 de noviembre de 2026)
La Cloud Function todavía no existe: el repositorio no tiene código de Cloud Functions y SIMAN no envía pedidos por API. Hoy los pedidos entran por Excel desde la pantalla Importar pedidos (app/despacho/importar.js): parseOrdersFile → validateOrders → resolveLocations → importOrders.

Mientras tanto se cumple el objetivo de la decisión: ningún sistema externo escribe en Firestore. Las reglas (firestore.cloud.rules) solo dejan crear envíos a una cuenta de despacho, en estado pendiente y con la forma exacta de importOrders. Cuando se implemente la Cloud Function, debería producir ese mismo documento de envío (shipmentFromOrder en src/features/orders/importOrders.js).
