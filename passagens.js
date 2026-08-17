const STORAGE_KEY = "controle_passagens_v1";
const form = document.querySelector("#tripForm");
const fields = {
  id: document.querySelector("#tripId"), purchaseDate: document.querySelector("#purchaseDate"),
  destination: document.querySelector("#destination"), airline: document.querySelector("#airline"),
  purchaseSite: document.querySelector("#purchaseSite"), price: document.querySelector("#price"),
  passenger: document.querySelector("#passenger"), seat: document.querySelector("#seat"),
  outboundCheckin: document.querySelector("#outboundCheckin"), returnCheckin: document.querySelector("#returnCheckin")
};
const formatMoney = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const formatDate = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

function readTrips() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; } }
function saveTrips(trips) { localStorage.setItem(STORAGE_KEY, JSON.stringify(trips)); }
function checkinState(date) { return new Date(date) <= new Date() ? "due" : "pending"; }
function dateText(date) { return formatDate.format(new Date(date)); }
function currentTrips() { return readTrips().sort((a, b) => new Date(a.outboundCheckin) - new Date(b.outboundCheckin)); }

function render() {
  const list = document.querySelector("#tripList");
  const query = document.querySelector("#searchInput").value.trim().toLocaleLowerCase("pt-BR");
  const trips = currentTrips();
  const visible = trips.filter(t => `${t.destination} ${t.passenger} ${t.airline}`.toLocaleLowerCase("pt-BR").includes(query));
  list.innerHTML = "";
  if (!visible.length) {
    list.innerHTML = `<div class="empty-state"><strong>${trips.length ? "Nenhuma passagem encontrada" : "Nenhuma passagem cadastrada"}</strong>${trips.length ? "Tente buscar por outro nome ou destino." : "Use o formulário ao lado para registrar a primeira compra."}</div>`;
  } else {
    const template = document.querySelector("#tripTemplate");
    visible.forEach(trip => {
      const item = template.content.cloneNode(true);
      item.querySelector(".trip-destination").textContent = trip.destination;
      item.querySelector(".trip-price").textContent = formatMoney.format(trip.price);
      item.querySelector(".trip-passenger").textContent = trip.passenger;
      item.querySelector(".trip-details").textContent = `${trip.airline} • ${trip.purchaseSite}${trip.seat ? ` • Assento ${trip.seat}` : ""}`;
      ["outbound", "return"].forEach(type => {
        const row = item.querySelector(`.${type}-row`);
        const state = checkinState(trip[`${type}Checkin`]);
        row.classList.add(state);
        row.querySelector(`.${type}-checkin`).textContent = state === "due" ? `Prazo: ${dateText(trip[`${type}Checkin`])}` : dateText(trip[`${type}Checkin`]);
      });
      item.querySelector(".edit-button").addEventListener("click", () => editTrip(trip.id));
      item.querySelector(".delete-button").addEventListener("click", () => deleteTrip(trip.id));
      list.appendChild(item);
    });
  }
  renderSummary(trips);
}

function renderSummary(trips) {
  document.querySelector("#totalTrips").textContent = trips.length;
  const pending = trips.flatMap(t => [t.outboundCheckin, t.returnCheckin]).filter(d => new Date(d) > new Date()).length;
  document.querySelector("#pendingCheckins").textContent = pending;
  document.querySelector("#totalValue").textContent = formatMoney.format(trips.reduce((sum, t) => sum + Number(t.price), 0));
  const future = trips.flatMap(t => [
    { date: t.outboundCheckin, type: "ida", trip: t }, { date: t.returnCheckin, type: "volta", trip: t }
  ]).filter(x => new Date(x.date) > new Date()).sort((a,b) => new Date(a.date) - new Date(b.date))[0];
  document.querySelector("#nextAlert").innerHTML = future ? `<span>PRÓXIMO CHECK-IN</span><strong>${future.trip.passenger} · ${future.type}</strong><span>${future.trip.destination}<br>${dateText(future.date)}</span>` : (trips.length ? "Não há check-ins futuros." : "Cadastre uma passagem para acompanhar o próximo check-in.");
}

function normalizeForm() { return Object.fromEntries(Object.entries(fields).map(([key, input]) => [key, input.value.trim()])); }
function resetForm() { form.reset(); fields.id.value = ""; document.querySelector("#formTitle").textContent = "Cadastrar passagem"; document.querySelector("#submitLabel").textContent = "Salvar passagem"; document.querySelector("#cancelEdit").classList.add("hidden"); }
function editTrip(id) {
  const trip = readTrips().find(t => t.id === id); if (!trip) return;
  Object.entries(fields).forEach(([key, input]) => input.value = trip[key] ?? "");
  document.querySelector("#formTitle").textContent = "Editar passagem"; document.querySelector("#submitLabel").textContent = "Atualizar passagem"; document.querySelector("#cancelEdit").classList.remove("hidden");
  document.querySelector(".form-card").scrollIntoView({ behavior: "smooth", block: "start" });
}
function deleteTrip(id) { if (!confirm("Excluir esta passagem? Esta ação não pode ser desfeita.")) return; saveTrips(readTrips().filter(t => t.id !== id)); resetForm(); render(); }

form.addEventListener("submit", event => {
  event.preventDefault(); const trip = normalizeForm(); trip.price = Number(trip.price);
  const trips = readTrips(); const pos = trips.findIndex(t => t.id === trip.id);
  if (pos >= 0) trips[pos] = trip; else { trip.id = String(Date.now()); trips.push(trip); }
  saveTrips(trips); resetForm(); render(); checkDueCheckins();
});
document.querySelector("#cancelEdit").addEventListener("click", resetForm);
document.querySelector("#searchInput").addEventListener("input", render);

async function enableNotifications() {
  if (!("Notification" in window)) { alert("Este navegador não suporta notificações."); return; }
  const permission = await Notification.requestPermission();
  updateNotificationButton();
  if (permission === "granted") checkDueCheckins();
}
function updateNotificationButton() {
  const button = document.querySelector("#notificationButton");
  if (!("Notification" in window)) { button.textContent = "Alertas indisponíveis"; button.disabled = true; return; }
  button.textContent = Notification.permission === "granted" ? "Alertas ativados ✓" : "Ativar alertas";
}
function checkDueCheckins() {
  const notified = JSON.parse(localStorage.getItem(`${STORAGE_KEY}_notified`) || "[]");
  const due = currentTrips().flatMap(t => [
    { key: `${t.id}-outbound`, date: t.outboundCheckin, trip: t, label: "ida" },
    { key: `${t.id}-return`, date: t.returnCheckin, trip: t, label: "volta" }
  ]).filter(x => new Date(x.date) <= new Date() && !notified.includes(x.key));
  due.forEach(alertItem => {
    if ("Notification" in window && Notification.permission === "granted") new Notification("Hora de fazer o check-in!", { body: `${alertItem.trip.passenger} — ${alertItem.label} para ${alertItem.trip.destination}` });
    notified.push(alertItem.key);
  });
  localStorage.setItem(`${STORAGE_KEY}_notified`, JSON.stringify(notified));
  if (due.length) render();
}
document.querySelector("#notificationButton").addEventListener("click", enableNotifications);
updateNotificationButton(); render(); checkDueCheckins(); setInterval(checkDueCheckins, 60000);
