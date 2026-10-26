# ADR 0003 · Capa intermedia para ingesta de pedidos de Siman
Estado: Aceptada · 20 de octubre de 2026

Contexto
Para el Sprint 4, el sistema debe recibir el flujo de pedidos desde el API de Almacenes Siman, pero actualmente tenemos información insuficiente sobre cómo enviarán los datos o con qué frecuencia cambiarán su formato [40]. Darles acceso directo a la base de datos es un riesgo alto (puerta de una vía sin información suficiente) [32, 40].

Decisión
Crearemos un microservicio intermedio (Cloud Function) que reciba el payload de Siman, lo procese y lo guarde en nuestra base de datos. Descartamos permitir que el sistema externo de Siman escriba directamente en nuestra colección de Firebase [40].

Consecuencias

Aislamiento del riesgo: Si Siman altera la estructura de sus datos, nuestra arquitectura central queda a salvo; solo se modifica la Cloud Function [40].

Mantenemos el control estricto sobre las reglas de seguridad de escritura en Firebase.

Agrega un nuevo componente de infraestructura que el equipo debe aprender a desarrollar, monitorear y desplegar.

Añade unos milisegundos de latencia en la creación inicial del pedido.
