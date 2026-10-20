# ADR 0001 · Firebase como Backend Serverless
Estado: Aceptada · 20 de octubre de 2026

Contexto
El sistema exige sincronización en tiempo real para que el despachador vea los cambios de estado al instante. El equipo tiene un tiempo de entrega muy corto (4 Sprints) y no cuenta con el conocimiento ni la capacidad operativa para configurar servidores, balanceadores de carga o WebSockets desde cero. Además, el criterio de Definition of Done nos empujó a la nube tempranamente [39].

Decisión
Usaremos Firebase directamente como nuestro backend como servicio (BaaS), conectando los clientes web y móvil directo a la base de datos. Descartamos construir una arquitectura tradicional con una base de datos relacional (AWS RDS / SQL Server) [39].

Consecuencias

Obtenemos sincronización en tiempo real de forma nativa y despliegue rápido.

No hay servidores de backend que administrar ni mantener.

Acoplamiento extremo: Como no hay un backend intermedio, un simple cambio de nombre en un estado (ej. de "pendiente" a "en_bodega") romperá simultáneamente la app móvil y los contadores web [40].

Bloqueo de proveedor (Vendor Lock-in): Si en el futuro se requiere migrar a un modelo relacional por reglas de negocio complejas, será una reescritura casi total
