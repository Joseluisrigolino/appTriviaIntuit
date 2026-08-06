const PARTICIPANTS = [
  "Daniel Gonzalez", "Jose Rigolino", "Juan Pereyra", "Julieta Ramos",
  "Julio Costas", "Marisa Cinque", "Marisol Galain", "Sebastian Romano", "Thiago Santero"
];
const ADMIN_PASSWORD = "juanaadmin";
const STORAGE_KEY = "intuit-trivia-state-v1";
const API_URL = "/api/state";

const defaultState = () => ({ version: 1, activeGameId: null, games: [], updatedAt: null });
let state = defaultState();
let storageMode = "local";
let toastTimer;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const formatDate = (date, long = true) => new Intl.DateTimeFormat("es-AR", long ? { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" } : { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
const initials = name => name.split(" ").map(part => part[0]).slice(0, 2).join("");
const activeGame = () => state.games.find(game => game.id === state.activeGameId) || null;

function normalizeState(raw) {
  if (!raw || !Array.isArray(raw.games)) return defaultState();
  return {
    version: 1,
    activeGameId: raw.activeGameId || null,
    updatedAt: raw.updatedAt || null,
    games: raw.games.map(game => ({
      ...game,
      clues: Array.isArray(game.clues) ? game.clues.map(clue => typeof clue === "string" ? { text: clue, revealed: false } : clue) : [],
      winner: PARTICIPANTS.includes(game.winner) ? game.winner : null
    }))
  };
}

async function loadState() {
  let local = null;
  try { local = normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY))); } catch {}
  try {
    const response = await fetch(API_URL, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("API unavailable");
    const remote = await response.json();
    state = remote && remote.games ? normalizeState(remote) : (local || defaultState());
    storageMode = "cloud";
  } catch {
    state = local || defaultState();
    storageMode = "local";
  }
  if (storageMode === "local") localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  render();
}

async function loadAdminState() {
  if (storageMode !== "cloud") return;
  try {
    const response = await fetch(API_URL, { headers: { Accept: "application/json", "X-Admin-Password": sessionStorage.getItem("intuit-trivia-admin") || "" } });
    if (!response.ok) throw new Error("Unauthorized");
    state = normalizeState(await response.json());
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render();
  } catch { showToast("No se pudo cargar el panel compartido"); }
}

async function persist(message = "Cambios guardados") {
  state.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  const password = sessionStorage.getItem("intuit-trivia-admin") || "";
  try {
    const response = await fetch(API_URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-Admin-Password": password },
      body: JSON.stringify(state)
    });
    if (!response.ok) throw new Error("Remote save failed");
    storageMode = "cloud";
  } catch { storageMode = "local"; }
  renderStorageStatus();
  showToast(storageMode === "cloud" ? message : `${message} en este navegador`);
}

function calculatePoints(game) {
  if (!game) return 20;
  const total = game.clues.length;
  const revealed = game.clues.filter(clue => clue.revealed).length;
  if (!total) return 20;
  return Math.max(1, Math.round(20 * (total + 1 - revealed) / (total + 1)));
}

function scoresByParticipant() {
  const scores = Object.fromEntries(PARTICIPANTS.map(name => [name, { name, points: 0, wins: 0 }]));
  state.games.filter(game => game.winner).forEach(game => {
    scores[game.winner].points += Number(game.pointsAwarded) || 0;
    scores[game.winner].wins += 1;
  });
  return Object.values(scores).sort((a, b) => b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name));
}

function render() {
  renderGame();
  renderLeaderboard();
  renderHistory();
  renderAdmin();
  renderStorageStatus();
}

function renderGame() {
  const game = activeGame();
  const points = calculatePoints(game);
  const revealed = game?.clues.filter(clue => clue.revealed) || [];
  $("#currentPoints").textContent = game?.winner ? game.pointsAwarded : points;
  $("#meterPoints").textContent = `${game?.winner ? game.pointsAwarded : points} puntos disponibles`;
  $("#pointsMeterFill").style.width = `${(game?.winner ? game.pointsAwarded : points) / 20 * 100}%`;
  $("#questionNumber").textContent = game ? String(state.games.findIndex(item => item.id === game.id) + 1).padStart(2, "0") : "—";
  $("#gameDateTitle").textContent = game ? formatDate(game.date) : "Preparando la próxima pregunta…";
  $("#questionText").textContent = game?.question || "Juana todavía no publicó la pregunta de hoy.";
  $("#questionCaption").textContent = game?.caption || (game ? "La respuesta se revela durante la daily." : "Cuando esté lista, aparecerá acá para todo el equipo.");
  $("#clueCounter").textContent = `${revealed.length} / ${game?.clues.length || 0}`;
  $("#cluesList").innerHTML = revealed.map((clue, index) => `<div class="clue-item"><span class="clue-index">${index + 1}</span><p>${escapeHtml(clue.text)}</p></div>`).join("");
  $("#clueEmpty").style.display = revealed.length ? "none" : "grid";
  const status = $("#answerStatus");
  status.classList.toggle("completed", Boolean(game?.winner));
  status.innerHTML = game?.winner ? `<span></span> Respondió ${escapeHtml(game.winner)} · ${game.pointsAwarded} puntos` : `<span></span> ${game ? "Respuesta abierta" : "Esperando la pregunta"}`;
}

function renderLeaderboard() {
  $("#leaderboard").innerHTML = scoresByParticipant().map((person, index) => `
    <div class="rank-row">
      <span class="rank-position">${index === 0 ? "♛" : String(index + 1).padStart(2, "0")}</span>
      <div class="rank-person"><span class="avatar">${initials(person.name)}</span><span>${escapeHtml(person.name)}</span></div>
      <div class="rank-meta"><small>VICTORIAS</small><b>${person.wins}</b></div>
      <div class="rank-points">${person.points} <small>PTS</small></div>
    </div>`).join("");
}

function renderHistory() {
  const completed = state.games.filter(game => game.winner).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  $("#historyGrid").innerHTML = completed.map(game => `
    <article class="history-card">
      <div class="history-date"><span>${formatDate(game.date, false).toUpperCase()}</span><span>${game.clues.filter(c => c.revealed).length} PISTAS</span></div>
      <h3>${escapeHtml(game.question)}</h3>
      <div class="history-winner"><span class="avatar">${initials(game.winner)}</span><span>${escapeHtml(game.winner)}</span><b>+${game.pointsAwarded} pts</b></div>
    </article>`).join("");
  $("#emptyHistory").style.display = completed.length ? "none" : "block";
}

function renderAdmin() {
  const game = activeGame();
  $("#gameDate").value = game?.date || today();
  $("#adminQuestion").value = game?.question || "";
  $("#adminCaption").value = game?.caption || "";
  $("#adminPoints").textContent = calculatePoints(game);
  $("#winnerSelect").innerHTML = `<option value="">Seleccionar participante</option>${PARTICIPANTS.map(name => `<option value="${escapeHtml(name)}" ${game?.winner === name ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}`;
  $("#awardWinner").disabled = Boolean(game?.winner);
  $("#awardWinner").textContent = game?.winner ? `Resultado cargado: ${game.winner}` : "Confirmar ganador y sumar puntos";
  $("#winnerSummary").textContent = game ? `${game.clues.filter(c => c.revealed).length} de ${game.clues.length} pistas reveladas.` : "Primero publicá una pregunta.";
  renderAdminClues(game?.clues || []);
}

function renderAdminClues(clues) {
  $("#adminClues").innerHTML = clues.map((clue, index) => `
    <div class="admin-clue-row" data-index="${index}">
      <input value="${escapeHtml(clue.text)}" aria-label="Pista ${index + 1}" placeholder="Escribí la pista ${index + 1}" />
      <button class="reveal-toggle ${clue.revealed ? "revealed" : ""}" type="button" title="${clue.revealed ? "Ocultar pista" : "Revelar pista"}">${clue.revealed ? "✓" : "○"}</button>
      <button class="remove-clue" type="button" aria-label="Eliminar pista">×</button>
    </div>`).join("");
  bindClueRows();
}

function bindClueRows() {
  $$(".reveal-toggle").forEach(button => button.addEventListener("click", async event => {
    const game = activeGame();
    if (!game || game.winner) return showToast(game?.winner ? "La partida ya terminó" : "Publicá una pregunta primero");
    const index = Number(event.currentTarget.closest(".admin-clue-row").dataset.index);
    syncClueTexts(game);
    game.clues[index].revealed = !game.clues[index].revealed;
    await persist(game.clues[index].revealed ? "Pista revelada" : "Pista ocultada");
  }));
  $$(".remove-clue").forEach(button => button.addEventListener("click", event => {
    const rows = $$(".admin-clue-row");
    const index = Number(event.currentTarget.closest(".admin-clue-row").dataset.index);
    const clues = rows.map(row => ({ text: row.querySelector("input").value, revealed: row.querySelector(".reveal-toggle").classList.contains("revealed") }));
    clues.splice(index, 1);
    renderAdminClues(clues);
  }));
}

function syncClueTexts(game) {
  $$(".admin-clue-row").forEach((row, index) => { if (game.clues[index]) game.clues[index].text = row.querySelector("input").value.trim(); });
}

function renderStorageStatus() {
  const element = $("#storageStatus");
  if (!element) return;
  element.classList.toggle("cloud", storageMode === "cloud");
  element.querySelector("b").textContent = storageMode === "cloud" ? "Sincronizado con Netlify" : "Guardado en este navegador";
  element.querySelector("small").textContent = storageMode === "cloud" ? "Los cambios están disponibles para todos." : "Publicada en Netlify usará guardado compartido.";
}

function showToast(message) {
  clearTimeout(toastTimer);
  $("#toast").textContent = message;
  $("#toast").classList.add("show");
  toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 2600);
}

function openAdmin() { $("#adminDrawer").classList.add("open"); $("#adminDrawer").setAttribute("aria-hidden", "false"); }
function closeAdmin() { $("#adminDrawer").classList.remove("open"); $("#adminDrawer").setAttribute("aria-hidden", "true"); }
function openLogin() { $("#loginModal").classList.add("open"); $("#loginModal").setAttribute("aria-hidden", "false"); setTimeout(() => $("#password").focus(), 100); }
function closeLogin() { $("#loginModal").classList.remove("open"); $("#loginModal").setAttribute("aria-hidden", "true"); $("#loginError").textContent = ""; }

$("#loginButton").addEventListener("click", async () => {
  if (sessionStorage.getItem("intuit-trivia-admin") !== ADMIN_PASSWORD) return openLogin();
  await loadAdminState(); openAdmin();
});
$("#closeLogin").addEventListener("click", closeLogin);
$("#loginModal").addEventListener("click", event => { if (event.target.id === "loginModal") closeLogin(); });
$("#closeAdmin").addEventListener("click", closeAdmin);
$("#togglePassword").addEventListener("click", () => { $("#password").type = $("#password").type === "password" ? "text" : "password"; });
$("#loginForm").addEventListener("submit", async event => {
  event.preventDefault();
  if ($("#password").value !== ADMIN_PASSWORD) { $("#loginError").textContent = "La contraseña no es correcta."; return; }
  sessionStorage.setItem("intuit-trivia-admin", ADMIN_PASSWORD);
  $("#password").value = "";
  closeLogin(); await loadAdminState(); openAdmin(); showToast("Bienvenida, Juana");
});

$$(".admin-tabs button").forEach(button => button.addEventListener("click", () => {
  $$(".admin-tabs button").forEach(item => item.classList.toggle("active", item === button));
  $$(".tab-panel").forEach(panel => panel.classList.toggle("active", panel.dataset.panel === button.dataset.tab));
}));

$("#saveQuestion").addEventListener("click", async () => {
  const question = $("#adminQuestion").value.trim();
  const date = $("#gameDate").value;
  if (!question || !date) return showToast("Completá la fecha y la pregunta");
  const current = activeGame();
  if (current && !current.winner) {
    current.date = date; current.question = question; current.caption = $("#adminCaption").value.trim();
  } else {
    const game = { id: `${date}-${Date.now()}`, date, question, caption: $("#adminCaption").value.trim(), clues: [], winner: null, pointsAwarded: null, completedAt: null };
    state.games.push(game); state.activeGameId = game.id;
  }
  await persist("Pregunta publicada");
});

$("#addClue").addEventListener("click", () => {
  const clues = $$(".admin-clue-row").map(row => ({ text: row.querySelector("input").value, revealed: row.querySelector(".reveal-toggle").classList.contains("revealed") }));
  clues.push({ text: "", revealed: false }); renderAdminClues(clues);
  $$(".admin-clue-row input").at(-1)?.focus();
});
$("#saveClues").addEventListener("click", async () => {
  const game = activeGame();
  if (!game) return showToast("Publicá una pregunta primero");
  if (game.winner) return showToast("La partida ya terminó");
  const clues = $$(".admin-clue-row").map(row => ({ text: row.querySelector("input").value.trim(), revealed: row.querySelector(".reveal-toggle").classList.contains("revealed") })).filter(clue => clue.text);
  game.clues = clues; await persist("Pistas guardadas");
});

$("#awardWinner").addEventListener("click", async () => {
  const game = activeGame(); const winner = $("#winnerSelect").value;
  if (!game) return showToast("Publicá una pregunta primero");
  if (game.winner) return showToast("Esta partida ya tiene ganador");
  if (!PARTICIPANTS.includes(winner)) return showToast("Seleccioná al participante ganador");
  game.winner = winner; game.pointsAwarded = calculatePoints(game); game.completedAt = new Date().toISOString();
  await persist(`${winner} sumó ${game.pointsAwarded} puntos`); launchConfetti(); closeAdmin();
});

$("#undoLast").addEventListener("click", async () => {
  const last = state.games.filter(game => game.winner).sort((a,b) => (b.completedAt || "").localeCompare(a.completedAt || ""))[0];
  if (!last) return showToast("No hay resultados para deshacer");
  if (!confirm(`¿Quitar el resultado de ${last.winner}?`)) return;
  last.winner = null; last.pointsAwarded = null; last.completedAt = null; state.activeGameId = last.id;
  await persist("Último resultado deshecho");
});
$("#logoutButton").addEventListener("click", () => { sessionStorage.removeItem("intuit-trivia-admin"); closeAdmin(); showToast("Sesión cerrada"); });

function download(filename, content, type) {
  const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([content], { type })); link.download = filename; link.click(); URL.revokeObjectURL(link.href);
}
$("#exportCsv").addEventListener("click", () => {
  const rows = [["Fecha","Día","Jugador","Puntos","Pregunta","Pistas usadas"]];
  state.games.filter(game => game.winner).forEach(game => rows.push([game.date, formatDate(game.date).split(",")[0], game.winner, game.pointsAwarded, game.question, game.clues.filter(c => c.revealed).length]));
  const csv = "\uFEFF" + rows.map(row => row.map(value => `"${String(value ?? "").replaceAll('"','""')}"`).join(",")).join("\r\n");
  download(`puntajes-trivia-${today()}.csv`, csv, "text/csv;charset=utf-8"); showToast("CSV descargado");
});
$("#exportJson").addEventListener("click", () => { download(`respaldo-trivia-${today()}.json`, JSON.stringify(state, null, 2), "application/json"); showToast("Respaldo descargado"); });
$("#importJson").addEventListener("change", async event => {
  const file = event.target.files[0]; if (!file) return;
  try { state = normalizeState(JSON.parse(await file.text())); await persist("Respaldo restaurado"); } catch { showToast("El archivo no es un respaldo válido"); }
  event.target.value = "";
});

function launchConfetti() {
  const colors = ["#5046e5", "#dff56b", "#ff8c75", "#ffffff", "#29c781"];
  $("#confetti").innerHTML = Array.from({ length: 75 }, (_, index) => `<i style="left:${Math.random()*100}%;background:${colors[index%colors.length]};--drift:${(Math.random()-.5)*250}px;animation-delay:${Math.random()*.65}s;transform:rotate(${Math.random()*180}deg)"></i>`).join("");
  setTimeout(() => $("#confetti").innerHTML = "", 3500);
}

document.addEventListener("keydown", event => { if (event.key === "Escape") { closeLogin(); closeAdmin(); } });
loadState();
