import { createClient } from "https://esm.sh/@supabase/supabase-js@2.59.0";

const supabase = createClient("https://vusizhpzeigupdjdgcdi.supabase.co", "sb_publishable_dpuSpZLDPeUJgbKcYeT2vg_acymlGhc");
const form = document.querySelector("#tripForm");
const authGate = document.querySelector("#authGate");
const fields = {
  id: document.querySelector("#tripId"), purchaseDate: document.querySelector("#purchaseDate"),
  destination: document.querySelector("#destination"), airline: document.querySelector("#airline"), flightCode: document.querySelector("#flightCode"),
  purchaseSite: document.querySelector("#purchaseSite"), price: document.querySelector("#price"), passenger: document.querySelector("#passenger"),
  seat: document.querySelector("#seat"), outboundFlightDate: document.querySelector("#outboundFlightDate"), returnFlightDate: document.querySelector("#returnFlightDate"),
  outboundCheckin: document.querySelector("#outboundCheckin"), returnCheckin: document.querySelector("#returnCheckin"), reminderEmail: document.querySelector("#reminderEmail")
};
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const dateOnly = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });
let session = null;
let trips = [];

const reminderDate = value => new Date(new Date(value).getTime() - 86400000);
const dateText = value => dateTime.format(new Date(value));
const flightText = value => dateOnly.format(new Date(`${value}T12:00`));
const toInputDateTime = value => value ? new Date(value).toISOString().slice(0, 16) : "";

function setStatus(message) { document.querySelector("#sessionStatus").textContent = message; }
function setFormAvailability(enabled) {
  [...form.elements].forEach(element => { if (element.type !== "hidden") element.disabled = !enabled; });
  document.querySelector("#searchInput").disabled = !enabled;
}
function renderSummary(data) {
  document.querySelector("#totalTrips").textContent = data.length;
  document.querySelector("#pendingCheckins").textContent = data.flatMap(t => [t.outboundCheckin, t.returnCheckin]).filter(d => reminderDate(d) > new Date()).length;
  document.querySelector("#totalValue").textContent = money.format(data.reduce((total, t) => total + Number(t.price), 0));
  const next = data.flatMap(t => [{ date: t.outboundCheckin, type: "ida", trip: t }, { date: t.returnCheckin, type: "volta", trip: t }]).filter(item => reminderDate(item.date) > new Date()).sort((a, b) => reminderDate(a.date) - reminderDate(b.date))[0];
  document.querySelector("#nextAlert").innerHTML = next ? `<span>PRÓXIMO LEMBRETE</span><strong>${next.trip.passenger} · ${next.type}</strong><span>${next.trip.destination}<br>24h antes: ${dateText(reminderDate(next.date))}</span>` : (data.length ? "Não há lembretes futuros." : "Cadastre uma passagem para acompanhar o próximo check-in.");
}
function render() {
  const list = document.querySelector("#tripList");
  const query = document.querySelector("#searchInput").value.trim().toLowerCase();
  const ordered = [...trips].sort((a, b) => new Date(a.outboundCheckin) - new Date(b.outboundCheckin));
  const visible = ordered.filter(t => `${t.destination} ${t.passenger} ${t.airline} ${t.flightCode || ""}`.toLowerCase().includes(query));
  list.innerHTML = "";
  if (!session) list.innerHTML = '<div class="empty-state"><strong>Entre para ver suas passagens</strong>Os dados ficam protegidos em sua conta.</div>';
  else if (!visible.length) list.innerHTML = `<div class="empty-state"><strong>${trips.length ? "Nenhuma passagem encontrada" : "Nenhuma passagem cadastrada"}</strong>${trips.length ? "Tente buscar por outro nome ou destino." : "Use o formulário ao lado para registrar a primeira compra."}</div>`;
  else {
    const template = document.querySelector("#tripTemplate");
    visible.forEach(trip => {
      const item = template.content.cloneNode(true);
      item.querySelector(".trip-destination").textContent = trip.destination;
      item.querySelector(".trip-price").textContent = money.format(trip.price);
      item.querySelector(".trip-passenger").textContent = trip.passenger;
      item.querySelector(".trip-details").textContent = `${trip.airline}${trip.flightCode ? ` • ${trip.flightCode}` : ""} • ${trip.purchaseSite}${trip.seat ? ` • Assento ${trip.seat}` : ""}`;
      item.querySelector(".trip-flights").textContent = `Voo: ida ${flightText(trip.outboundFlightDate)} • volta ${flightText(trip.returnFlightDate)}`;
      ["outbound", "return"].forEach(type => {
        const row = item.querySelector(`.${type}-row`);
        const late = reminderDate(trip[`${type}Checkin`]) <= new Date();
        row.classList.add(late ? "due" : "pending");
        row.querySelector(`.${type}-checkin`).textContent = late ? `Lembrete: faça o check-in (${dateText(trip[`${type}Checkin`])})` : `Check-in: ${dateText(trip[`${type}Checkin`])}`;
      });
      item.querySelector(".edit-button").addEventListener("click", () => editTrip(trip.id));
      item.querySelector(".delete-button").addEventListener("click", () => deleteTrip(trip.id));
      list.appendChild(item);
    });
  }
  renderSummary(ordered);
}
function databaseTrip(row) {
  return { id: row.id, purchaseDate: row.purchase_date, destination: row.destination, airline: row.airline, flightCode: row.flight_code || "", purchaseSite: row.purchase_site, price: Number(row.price), passenger: row.passenger, seat: row.seat || "", outboundFlightDate: row.outbound_flight_date, returnFlightDate: row.return_flight_date, outboundCheckin: toInputDateTime(row.outbound_checkin_at), returnCheckin: toInputDateTime(row.return_checkin_at), reminderEmail: row.reminder_email };
}
function tripPayload(trip) {
  return { purchase_date: trip.purchaseDate, destination: trip.destination, airline: trip.airline, flight_code: trip.flightCode || null, purchase_site: trip.purchaseSite, price: Number(trip.price), passenger: trip.passenger, seat: trip.seat || null, outbound_flight_date: trip.outboundFlightDate, return_flight_date: trip.returnFlightDate, outbound_checkin_at: new Date(trip.outboundCheckin).toISOString(), return_checkin_at: new Date(trip.returnCheckin).toISOString(), reminder_email: trip.reminderEmail };
}
async function loadTrips() {
  if (!session) { trips = []; render(); return; }
  const { data, error } = await supabase.from("trips").select("*").order("outbound_checkin_at");
  if (error) return alert(`Não foi possível carregar as passagens: ${error.message}`);
  trips = data.map(databaseTrip);
  render();
}
function normalizeForm() { return Object.fromEntries(Object.entries(fields).map(([key, input]) => [key, input.value.trim()])); }
function resetForm() { form.reset(); fields.id.value = ""; document.querySelector("#formTitle").textContent = "Cadastrar passagem"; document.querySelector("#submitLabel").textContent = "Salvar passagem"; document.querySelector("#cancelEdit").classList.add("hidden"); }
function editTrip(id) {
  const trip = trips.find(t => t.id === id); if (!trip) return;
  Object.entries(fields).forEach(([key, input]) => input.value = trip[key] ?? "");
  document.querySelector("#formTitle").textContent = "Editar passagem"; document.querySelector("#submitLabel").textContent = "Atualizar passagem"; document.querySelector("#cancelEdit").classList.remove("hidden");
  document.querySelector(".form-card").scrollIntoView({ behavior: "smooth", block: "start" });
}
async function deleteTrip(id) {
  if (!confirm("Excluir esta passagem? Esta ação não pode ser desfeita.")) return;
  const { error } = await supabase.from("trips").delete().eq("id", id);
  if (error) return alert(error.message);
  resetForm(); await loadTrips();
}
async function setSession(nextSession) {
  session = nextSession;
  authGate.classList.toggle("hidden", Boolean(session));
  document.querySelector("#signOutButton").classList.toggle("hidden", !session);
  setFormAvailability(Boolean(session));
  setStatus(session ? session.user.email : "Faça login para acessar");
  await loadTrips();
}
async function enableNotifications() {
  if (!("Notification" in window)) return alert("Este navegador não suporta notificações.");
  const permission = await Notification.requestPermission();
  document.querySelector("#notificationButton").textContent = permission === "granted" ? "Alertas ativados ✓" : "Ativar alertas";
}

form.addEventListener("submit", async event => {
  event.preventDefault(); if (!session) return;
  const trip = normalizeForm();
  const request = trip.id ? supabase.from("trips").update(tripPayload(trip)).eq("id", trip.id) : supabase.from("trips").insert(tripPayload(trip));
  const { error } = await request;
  if (error) return alert(`Não foi possível salvar: ${error.message}`);
  resetForm(); await loadTrips();
});
document.querySelector("#cancelEdit").addEventListener("click", resetForm);
document.querySelector("#searchInput").addEventListener("input", render);
document.querySelector("#notificationButton").addEventListener("click", enableNotifications);
document.querySelector("#signOutButton").addEventListener("click", () => supabase.auth.signOut());
document.querySelector("#authForm").addEventListener("submit", async event => {
  event.preventDefault();
  const { error } = await supabase.auth.signInWithPassword({ email: document.querySelector("#authEmail").value, password: document.querySelector("#authPassword").value });
  if (error) alert(error.message);
});
document.querySelector("#signUpButton").addEventListener("click", async () => {
  const { error } = await supabase.auth.signUp({ email: document.querySelector("#authEmail").value, password: document.querySelector("#authPassword").value });
  if (error) return alert(error.message);
  alert("Conta criada. Confirme o cadastro no seu e-mail antes de entrar.");
});

setFormAvailability(false);
supabase.auth.getSession().then(({ data }) => setSession(data.session));
supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
