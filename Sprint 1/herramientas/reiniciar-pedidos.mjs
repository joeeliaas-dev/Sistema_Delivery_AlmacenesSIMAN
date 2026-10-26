// Vuelve todos los pedidos a "pendiente" para repetir la prueba. Sin dependencias (Node 18 o superior).
// Uso, desde la raíz del repositorio:  node "Sprint 1/herramientas/reiniciar-pedidos.mjs"
const PROYECTO = "siman-delivery-app";
const API_KEY = "AIzaSyDPi2yn8IUj8RT507m0wT5ke6VX5kY1nvE";
const base = `https://firestore.googleapis.com/v1/projects/${PROYECTO}/databases/(default)/documents/pedidos`;

const respuesta = await fetch(`${base}?key=${API_KEY}`);
const { documents = [] } = await respuesta.json();
for (const documento of documents) {
  const id = documento.name.split("/").pop();
  const url = `${base}/${id}?key=${API_KEY}&updateMask.fieldPaths=estado`;
  const r = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields: { estado: { stringValue: "pendiente" } } })
  });
  console.log(`Pedido #${id}: ${r.ok ? "pendiente" : `error ${r.status}`}`);
}
