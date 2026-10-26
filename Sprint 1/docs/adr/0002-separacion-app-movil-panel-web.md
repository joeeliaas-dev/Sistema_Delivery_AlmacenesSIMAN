# ADR 0002 · Separación de interfaces: App nativa y Panel web
Estado: Aceptada · 20 de octubre de 2026

Contexto
El sistema atiende a dos usuarios con contextos físicos distintos: el despachador trabaja en oficina con monitores grandes, mientras que el motorista está en la calle, con conexión inestable y necesidad de acceder al hardware nativo del teléfono (cámara para evidencia fotográfica y GPS).

Decisión
Construiremos una aplicación móvil nativa separada exclusivamente para el motorista, y un panel web independiente para el despachador. Descartamos hacer una única aplicación web responsiva para ambos roles.

Consecuencias

La app nativa permite invocar eficientemente la cámara y gestionar el almacenamiento local si se pierde la red.

Las vistas de gestión en el panel web no tienen restricciones de espacio móvil.

Duplicidad tecnológica: Obliga al equipo a mantener repositorios separados, flujos CI/CD distintos y tecnologías diferentes.

Aumenta la complejidad para realizar pruebas de integración de extremo a extremo (E2E).
