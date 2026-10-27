# Trazza - Siman Delivery 

Aplicación de entregas desarrollado con **HTML, CSS y JavaScript**, priorizando el diseño en sistemas móviles. Los datos viven en **Firebase (Cloud Firestore)**.
Cuenta con dos partes:
- **Panel web** (este repositorio): pantalla de entregas del día, con la
  lista de pedidos, su estado (pendiente, entregado o fallido) y el avance
  de la ruta. Los pedidos se leen y se actualizan en tiempo real en
  Firebase (Cloud Firestore).
- **App móvil del motorista** (repositorio `repo-temporal-trazza`): la usa
  el motorista en la calle para ver sus entregas y registrar el resultado

# CI/CD
El flujo está en `.github/workflows/ci.yml` y usa GitHub Actions. Se ejecuta
en cada push a `main`, en cada pull request hacia `main`, y a mano desde la
pestaña Actions.

# Entorno
**En línea:** https://siman-delivery-app.web.app
