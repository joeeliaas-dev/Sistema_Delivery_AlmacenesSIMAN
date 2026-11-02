# ADR 0006 · Firebase Authentication como backend de seguridad

Estado: Aceptada · 1 de noviembre de 2026

Contexto La aplicación no guarda información localmente; requiere actualizaciones de datos en tiempo real, accesibilidad desde móvil y web, y validaciones de seguridad inmediatas en cada operación dependiendo del rol del usuario.

Decisión Todo el sistema utilizará Firebase (y Firebase Authentication) como backend principal para unificar la autenticación, la seguridad de inicio de sesión, los datos y la sincronización continua en un solo lugar.

Consecuencias

Permite que el despachador y el motorista tengan acceso parcial únicamente a sus funciones autorizadas.

Centraliza las reglas de acceso en un solo ecosistema confiable.

Genera un acoplamiento total y definitivo al ecosistema de Google.

Cualquier cambio futuro de base de datos requerirá reescribir toda la capa de seguridad y autenticación.
