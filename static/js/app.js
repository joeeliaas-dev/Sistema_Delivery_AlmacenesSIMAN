"use strict";

// El frontend solo conoce esta API. La integración con Firebase vive en pedidos.py.
const apiUrl = document.body.dataset.apiUrl;
const list = document.querySelector("#orders-list");
const template = document.querySelector("#order-template");
const refreshButton = document.querySelector("#refresh-button");
const searchInput = document.querySelector("#search-input");
const filterButtons = [...document.querySelectorAll("[data-filter]")];
const labels = { pendiente: "Pendiente", entregado: "Entregado", fallido: "Fallido" };
const statusIcons = { pendiente: "clock", entregado: "check", fallido: "x" };
let orders = [];
let filter = "todos";
let loaded = false;
let refreshing = false;
let notificationTimer;
const saving = new Set();
const cards = new Map();

const date = new Date();
document.querySelector("#today-date").textContent = new Intl.DateTimeFormat("es-GT", {
  weekday: "long", day: "numeric", month: "long", timeZone: "America/Guatemala"
}).format(date);
document.querySelector("#today-date").dateTime = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Guatemala", year: "numeric", month: "2-digit", day: "2-digit"
}).format(date);

function setConnection(status) {
  document.querySelector("#connection-status").dataset.status = status;
  document.querySelector("#connection-text").textContent = {
    loading: "Conectando", online: "En línea", error: "Sin conexión"
  }[status];
}

async function requestJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "El servidor no pudo completar la solicitud.");
    setConnection("online");
    return data;
  } catch (error) {
    if (error.name === "AbortError" || error instanceof TypeError) {
      setConnection("error");
      throw new Error("El servidor no respondió. Revisa tu conexión y vuelve a intentar.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function updateRefreshButton() {
  refreshButton.disabled = refreshing || saving.size > 0;
  refreshButton.classList.toggle("loading", refreshing);
}

function updateCard(card, order) {
  card.dataset.orderId = order.id;
  card.dataset.state = order.estado;
  card.querySelector(".order-number").textContent = `PEDIDO #${order.id}`;
  card.querySelector(".client-name").textContent = order.cliente;
  card.querySelector(".order-address").textContent = order.direccion;
  card.querySelector(".package-detail span").textContent = order.paquete || "Pedido Siman";
  card.querySelector(".time-detail span").textContent = order.ventana || "Entrega durante el día";
  card.querySelector(".status-badge span").textContent = labels[order.estado];
  card.querySelector(".status-badge use").setAttribute("href", `#icon-${statusIcons[order.estado]}`);
  card.setAttribute("aria-label", `Pedido ${order.id}, ${order.cliente}, ${labels[order.estado]}`);
  for (const button of card.querySelectorAll("[data-state]")) {
    button.disabled = refreshing || saving.has(order.id) || button.dataset.state === order.estado;
    button.setAttribute("aria-label", `Marcar pedido ${order.id} de ${order.cliente} como ${button.dataset.state}`);
    button.setAttribute("aria-pressed", String(button.dataset.state === order.estado));
  }
  const feedback = card.querySelector(".card-feedback");
  feedback.textContent = order.estado === "pendiente" ? "Actualiza al finalizar la visita." : "Estado registrado. Puedes corregirlo con el otro botón.";
  delete feedback.dataset.kind;
}

function renderOrders() {
  const fragment = document.createDocumentFragment();
  cards.clear();
  for (const order of orders) {
    const card = template.content.firstElementChild.cloneNode(true);
    updateCard(card, order);
    cards.set(order.id, card);
    fragment.append(card);
  }
  list.replaceChildren(fragment);
}

function updateSummary() {
  const counts = { pendiente: 0, entregado: 0, fallido: 0 };
  for (const order of orders) counts[order.estado] += 1;
  document.querySelector("#pending-count").textContent = counts.pendiente;
  document.querySelector("#delivered-count").textContent = counts.entregado;
  document.querySelector("#failed-count").textContent = counts.fallido;
  document.querySelector("#total-badge").textContent = orders.length;
  const visited = counts.entregado + counts.fallido;
  const progress = document.querySelector("#route-progress");
  progress.max = orders.length || 1;
  progress.value = visited;
  document.querySelector("#progress-text").textContent = `${visited} de ${orders.length} visitas`;
  document.querySelector("#progress-description").textContent = orders.length === 0
    ? "Tu ruta todavía no tiene pedidos asignados."
    : counts.pendiente === 0 ? "¡Jornada registrada! Todas las visitas tienen un resultado."
    : `${counts.pendiente} ${counts.pendiente === 1 ? "visita por registrar" : "visitas por registrar"}. Vamos paso a paso.`;
  const next = orders.find(order => order.estado === "pendiente");
  document.querySelector("#next-client").textContent = next?.cliente || "Sin entregas pendientes";
  document.querySelector("#next-address").textContent = next?.direccion || "Todos los resultados están al día.";
}

function normalize(value) {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function applyFilters() {
  if (!loaded) return;
  const query = normalize(searchInput.value.trim());
  let visible = 0;
  for (const order of orders) {
    const matchesState = filter === "todos" || order.estado === filter;
    const matchesSearch = normalize(`${order.id} ${order.cliente} ${order.direccion}`).includes(query);
    const card = cards.get(order.id);
    card.hidden = !(matchesState && matchesSearch);
    if (!card.hidden) visible += 1;
  }
  document.querySelector("#results-description").textContent = `${visible} ${visible === 1 ? "entrega" : "entregas"}${filter === "todos" && !query ? " en tu ruta" : ` de ${orders.length} en tu ruta`}`;
  document.querySelector("#empty-state").hidden = visible > 0;
  document.querySelector("#empty-title").textContent = orders.length === 0 ? "Tu ruta está por comenzar" : "No hay entregas aquí";
  document.querySelector("#empty-message").textContent = orders.length === 0
    ? "Cuando se asignen pedidos, aparecerán en esta pantalla."
    : "Prueba con otro estado o una búsqueda diferente.";
}

async function loadOrders() {
  if (refreshing || saving.size > 0) return;
  refreshing = true;
  updateRefreshButton();
  list.setAttribute("aria-busy", "true");
  document.querySelector("#list-error").hidden = true;
  document.querySelector("#retry-button").disabled = true;
  for (const order of orders) updateCard(cards.get(order.id), order);
  try {
    const data = await requestJson(apiUrl);
    orders = data.pedidos;
    loaded = true;
    refreshing = false;
    renderOrders();
    updateSummary();
    applyFilters();
  } catch (error) {
    document.querySelector("#list-error-message").textContent = error.message;
    document.querySelector("#list-error").hidden = false;
    if (!loaded) {
      document.querySelector("#results-description").textContent = "Entregas no disponibles";
      document.querySelector("#next-client").textContent = "Ruta no disponible";
      document.querySelector("#next-address").textContent = "Vuelve a intentar cargar las entregas.";
      document.querySelector("#progress-description").textContent = "No se pudo consultar el avance.";
    }
  } finally {
    refreshing = false;
    updateRefreshButton();
    document.querySelector("#retry-button").disabled = false;
    document.querySelector("#loading-state").hidden = true;
    list.setAttribute("aria-busy", "false");
    for (const order of orders) updateCard(cards.get(order.id), order);
  }
}

function notify(message) {
  clearTimeout(notificationTimer);
  const notification = document.querySelector("#notification");
  notification.querySelector("span").textContent = message;
  notification.hidden = false;
  notificationTimer = setTimeout(() => { notification.hidden = true; }, 4500);
}

async function saveState(orderId, state) {
  const order = orders.find(item => item.id === orderId);
  if (!order || refreshing || saving.has(orderId) || order.estado === state) return;
  const card = cards.get(orderId);
  const feedback = card.querySelector(".card-feedback");
  const hadFocus = card.contains(document.activeElement);
  saving.add(orderId);
  updateRefreshButton();
  updateCard(card, order);
  card.setAttribute("aria-busy", "true");
  feedback.textContent = "Guardando el resultado…";
  try {
    const data = await requestJson(`${apiUrl}/${orderId}/estado`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: state })
    });
    orders[orders.findIndex(item => item.id === orderId)] = data.pedido;
    saving.delete(orderId);
    updateCard(card, data.pedido);
    feedback.textContent = "Guardado en el sistema. Puedes corregir el resultado.";
    feedback.dataset.kind = "success";
    card.classList.remove("saved");
    requestAnimationFrame(() => card.classList.add("saved"));
    updateSummary();
    applyFilters();
    // Conserva un foco visible si el filtro oculta la tarjeta o el botón queda deshabilitado.
    if (hadFocus && (document.activeElement === document.body || card.contains(document.activeElement))) {
      if (card.hidden) filterButtons.find(button => button.dataset.filter === filter).focus();
      else card.querySelector(`[data-state="${state === "entregado" ? "fallido" : "entregado"}"]`).focus({ preventScroll: true });
    }
    notify(`Pedido #${orderId} registrado como ${state}.`);
  } catch (error) {
    saving.delete(orderId);
    updateCard(card, order);
    feedback.textContent = `No se confirmó el cambio. ${error.message}`;
    feedback.dataset.kind = "error";
    if (hadFocus && document.activeElement === document.body) {
      card.querySelector(`[data-state="${state}"]`).focus({ preventScroll: true });
    }
  } finally {
    saving.delete(orderId);
    card.setAttribute("aria-busy", "false");
    updateRefreshButton();
  }
}

list.addEventListener("click", event => {
  const button = event.target.closest("button[data-state]");
  if (!button || button.disabled) return;
  saveState(Number(button.closest(".order-card").dataset.orderId), button.dataset.state);
});
for (const button of filterButtons) {
  button.addEventListener("click", () => {
    filter = button.dataset.filter;
    for (const item of filterButtons) {
      const active = item === button;
      item.classList.toggle("active", active);
      item.setAttribute("aria-pressed", String(active));
    }
    applyFilters();
  });
}
searchInput.addEventListener("input", applyFilters);
refreshButton.addEventListener("click", loadOrders);
document.querySelector("#retry-button").addEventListener("click", loadOrders);
loadOrders();
