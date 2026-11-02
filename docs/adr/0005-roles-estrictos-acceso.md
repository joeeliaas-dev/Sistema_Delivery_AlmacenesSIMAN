# ADR 0005 · Separación estricta de roles: Despacho vs. Motorista

Estado: Aceptada · 1 de noviembre de 2026

Contexto El sistema no puede permitir que cualquier usuario abra cualquier vista, ya que esto rompería la lógica de negocio y la separación de responsabilidades operacionales.

Decisión Incorporaremos roles estrictos de acceso. La autenticación cargará el rol desde Firebase y una capa de navegación impedirá el acceso no autorizado, asegurando que el despachador solo vea el panel de gestión y el motorista solo acceda a su flujo operativo.

Consecuencias

Garantiza la seguridad y la separación de responsabilidades.

Hace más sostenibles las pruebas, la auditoría y la futura evolución del producto.

Condiciona fuertemente la arquitectura completa de los módulos.

Obliga a programar flujos de redirección y manejos de estado más complejos en el frontend.
