// Acceso a los pedidos en Firebase (Cloud Firestore). Reemplaza al backend Flask (app.py + pedidos.py):
// las mismas dos operaciones, con los mismos campos y mensajes, pero directo desde el navegador.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { doc, getDoc, getDocs, getFirestore, collection, updateDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const firebaseConfig = await (await fetch("/__/firebase/init.json")).json();

const db = getFirestore(initializeApp(firebaseConfig));
const ESTADOS_VALIDOS = ["entregado", "fallido"];

/** Todos los pedidos, en orden estable por id (antes: GET /api/pedidos). */
export async function listarPedidos() {
  const snapshot = await getDocs(collection(db, "pedidos"));
  return snapshot.docs.map(documento => documento.data()).sort((a, b) => a.id - b.id);
}

/** Guarda fallido/entregado y devuelve el pedido actualizado (antes: PATCH /api/pedidos/<id>/estado). */
export async function actualizarEstadoPedido(pedidoId, estado) {
  if (!ESTADOS_VALIDOS.includes(estado)) throw new Error("El estado debe ser 'fallido' o 'entregado'.");
  const referencia = doc(db, "pedidos", String(pedidoId));
  const actual = await getDoc(referencia);
  if (!actual.exists()) throw new Error("No se encontró el pedido solicitado.");
  await updateDoc(referencia, { estado });
  return { ...actual.data(), estado };
}
