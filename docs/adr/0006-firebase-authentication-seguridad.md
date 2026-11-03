# ADR 0006 · Firebase Authentication como backend de seguridad

Estado: Aceptada · 1 de noviembre de 2026 · Precisada (ver nota del 3 de noviembre de 2026)

Contexto La aplicación no guarda información localmente; requiere actualizaciones de datos en tiempo real, accesibilidad desde móvil y web, y validaciones de seguridad inmediatas en cada operación dependiendo del rol del usuario.

Decisión Todo el sistema utilizará Firebase (y Firebase Authentication) como backend principal para unificar la autenticación, la seguridad de inicio de sesión, los datos y la sincronización continua en un solo lugar.

Consecuencias

Permite que el despachador y el motorista tengan acceso parcial únicamente a sus funciones autorizadas.

Centraliza las reglas de acceso en un solo ecosistema confiable.

Genera un acoplamiento total y definitivo al ecosistema de Google.

Cualquier cambio futuro de base de datos requerirá reescribir toda la capa de seguridad y autenticación.

Nota de implementación (3 de noviembre de 2026)
El contexto dice que "la aplicación no guarda información localmente"; en la implementación eso no es exacto. Firestore sigue siendo la única fuente de verdad, pero la app guarda en el dispositivo tres cosas temporales:

- Bandeja sin señal (src/lib/outbox.js, localStorage): entregas y no entregas que el motorista registró sin conexión, con su foto, hasta que se envían.
- Borrador del formulario de evidencia (src/features/driver/draftStorage.web.js, sessionStorage): por si el navegador recarga la página al volver de la cámara.
- Conteo diario de llamadas a Geoapify (src/lib/geoapify.js, localStorage).

Nada de esto cambia la seguridad: lo guardado solo llega a Firestore a través de los servicios y las reglas, con la sesión y el rol de quien lo envía.
