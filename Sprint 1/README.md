# Trazza - Siman Delivery 

Aplicación de entregas desarrollado con **HTML, CSS y JavaScript**, priorizando el diseño en sistemas móviles. Los datos viven en **Firebase (Cloud Firestore)**.
- **Panel web** :pantalla de entregas del día, con la
  lista de pedidos, su estado (pendiente, entregado o fallido) y el avance
  de la ruta. Los pedidos se leen y se actualizan en tiempo real en
  Firebase (Cloud Firestore).
- **App móvil del motorista**: la usa
  el motorista en la calle para ver sus entregas y registrar el resultado.

# CI/CD
Este prototipo ya no se revisa ni se publica desde GitHub Actions: el CI
(`.github/workflows/ci.yml`) revisa la app actual (Expo) de la raíz del
repositorio. Para publicar el prototipo a mano en `siman-delivery-app`:
`firebase deploy --config "Sprint 1/firebase.json" --project sprint1`.

# Entorno
**En línea:** https://trazzasv.web.app/ 

# Claves de acceso
Despachador:
- Correo: despacho@trazzasv.test 
- Contraseña: pruebas123.
