const PARTICIPANTS = [
  "Daniel Gonzalez", "Jose Rigolino", "Juan Pereyra", "Julieta Ramos",
  "Julio Costas", "Marisa Cinque", "Marisol Galain", "Sebastian Romano", "Thiago Santero"
];
const ADMIN_PASSWORD = "juanaadmin";
const STORAGE_KEY = "intuit-trivia-state-v2";
const API_URL = "/api/state";
const REFRESH_INTERVAL = 4000;

const defaultState = () => ({ version: 2, activeGameId: null, games: [], updatedAt: null });
let state = defaultState();
let storageMode = "local";
let toastTimer;
let tourIndex = 0;

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const formatDate = (date, long = true) => new Intl.DateTimeFormat("es-AR", long ? { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" } : { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
const initials = name => name.split(" ").map(part => part[0]).slice(0, 2).join("");
const activeGame = () => state.games.find(game => game.id === state.activeGameId) || null;
const isAdmin = () => sessionStorage.getItem("intuit-trivia-admin") === ADMIN_PASSWORD;

function normalizeState(raw) {
  if (!raw || !Array.isArray(raw.games)) return defaultState();
  return {
    version: 2,
    activeGameId: raw.activeGameId || null,
    updatedAt: raw.updatedAt || null,
    games: raw.games.map(game => ({
      ...game,
      status: game.status || (game.winner ? "completed" : "published"),
      clues: Array.isArray(game.clues) ? game.clues.map(clue => typeof clue === "string" ? { text: clue, revealed: false } : { text: clue.text || "", revealed: Boolean(clue.revealed) }) : [],
      winner: PARTICIPANTS.includes(game.winner) ? game.winner : null
    }))
  };
}

async function fetchState(password = "") {
  const response = await fetch(`${API_URL}?t=${Date.now()}`, {
    cache: "no-store",
    headers: { Accept: "application/json", ...(password ? { "X-Admin-Password": password } : {}) }
  });
  if (!response.ok) throw new Error("API unavailable");
  return normalizeState(await response.json());
}

async function loadState() {
  let local = null;
  try { local = normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY))); } catch {}
  try {
    state = await fetchState();
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
    state = await fetchState(sessionStorage.getItem("intuit-trivia-admin") || "");
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render();
  } catch { showToast("No se pudo cargar el panel compartido"); }
}

async function refreshPublicState() {
  if (storageMode !== "cloud" || isAdmin() || document.hidden) return;
  try {
    const nextState = await fetchState();
    if (nextState.updatedAt === state.updatedAt) return;
    const previousWinners = new Set(state.games.filter(game => game.winner).map(game => game.id));
    const hasNewWinner = nextState.games.some(game => game.winner && !previousWinners.has(game.id));
    state = nextState;
    render();
    if (hasNewWinner) launchConfetti();
  } catch {}
}

async function persist(message = "Cambios guardados") {
  state.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  try {
    const response = await fetch(API_URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-Admin-Password": sessionStorage.getItem("intuit-trivia-admin") || "" },
      body: JSON.stringify(state)
    });
    if (!response.ok) throw new Error("Remote save failed");
    storageMode = "cloud";
  } catch { storageMode = "local"; }
  render();
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
  const completed = game?.status === "completed";
  $("#currentPoints").textContent = completed ? game.pointsAwarded : points;
  $("#meterPoints").textContent = `${completed ? game.pointsAwarded : points} puntos disponibles`;
  $("#pointsMeterFill").style.width = `${(completed ? game.pointsAwarded : points) / 20 * 100}%`;
  $("#questionNumber").textContent = game ? String(state.games.findIndex(item => item.id === game.id) + 1).padStart(2, "0") : "—";
  $("#gameDateTitle").textContent = game ? formatDate(game.date) : "Preparando la próxima pregunta…";
  $("#questionText").textContent = game?.question || "Juana todavía no publicó la pregunta de hoy.";
  $("#questionCaption").textContent = game?.caption || (game ? "La respuesta se revela durante la daily." : "Cuando esté lista, aparecerá acá para todo el equipo.");
  $("#clueCounter").textContent = `${revealed.length} / ${game?.clues.length || 0}`;
  $("#cluesList").innerHTML = revealed.map((clue, index) => `
    <div class="clue-item"><span class="clue-index">${index + 1}</span><p>${completed && clue.text ? escapeHtml(clue.text) : `Pista ${index + 1} usada en la daily`}</p></div>`).join("");
  $("#clueEmpty").style.display = revealed.length ? "none" : "grid";
  $("#clueEmpty p").textContent = game ? "Juana todavía no usó pistas." : "Todavía no hay pistas reveladas.";
  $("#clueEmpty small").textContent = game ? "Juana las comparte en voz alta para que sea justo." : "Cada pista usada reduce el premio.";
  const status = $("#answerStatus");
  status.classList.toggle("completed", completed);
  status.innerHTML = completed ? `<span></span> Respondió ${escapeHtml(game.winner)} · ${game.pointsAwarded} puntos` : `<span></span> ${game ? "El equipo está adivinando" : "Esperando la pregunta"}`;
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

function flowStep(game) {
  if (!game || game.status === "draft") return "question";
  if (game.status === "ready") return "clues";
  if (game.status === "published") return "live";
  return "winner";
}

function renderAdmin() {
  const game = activeGame();
  const locked = game?.status === "published" || game?.status === "completed";
  $("#gameDate").value = game?.date || today();
  $("#adminQuestion").value = game?.question || "";
  $("#adminCaption").value = game?.caption || "";
  $("#gameDate").disabled = locked;
  $("#adminQuestion").disabled = locked;
  $("#adminCaption").disabled = locked;
  $("#saveQuestion").disabled = locked;
  $("#saveQuestion").textContent = locked ? "Pregunta ya publicada" : "Guardar pregunta y continuar";
  $("#adminPoints").textContent = calculatePoints(game);
  $("#winnerSelect").innerHTML = `<option value="">Seleccionar participante</option>${PARTICIPANTS.map(name => `<option value="${escapeHtml(name)}" ${game?.winner === name ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}`;
  $("#awardWinner").disabled = game?.status !== "published";
  $("#awardWinner").textContent = game?.winner ? `Resultado cargado: ${game.winner}` : "Confirmar ganador y sumar puntos";
  $("#winnerSummary").textContent = game ? `${game.clues.filter(c => c.revealed).length} de ${game.clues.length} pistas usadas.` : "Primero prepará y publicá una pregunta.";
  $("#addClue").disabled = !game || locked;
  $("#saveClues").disabled = !game || locked;
  $("#publishGame").disabled = game?.status !== "ready" || !game.clues.length;
  renderAdminClues(game?.clues || [], locked);
  renderLivePanel(game);

  const allowed = {
    question: true,
    clues: Boolean(game),
    live: game?.status === "published" || game?.status === "completed",
    winner: game?.status === "published" || game?.status === "completed",
    data: true
  };
  $$(".admin-tabs button").forEach(button => { button.disabled = !allowed[button.dataset.tab]; });
  const order = ["question", "clues", "live", "winner"];
  const currentIndex = order.indexOf(flowStep(game));
  $$("#hostProgress [data-step]").forEach((element, index) => {
    element.classList.toggle("active", index === currentIndex);
    element.classList.toggle("done", index < currentIndex || game?.status === "completed");
  });
}

function renderAdminClues(clues, locked = false) {
  $("#adminClues").innerHTML = clues.map((clue, index) => `
    <div class="admin-clue-row" data-index="${index}">
      <div class="clue-order"><button data-move="up" type="button" ${locked || index === 0 ? "disabled" : ""}>▲</button><button data-move="down" type="button" ${locked || index === clues.length - 1 ? "disabled" : ""}>▼</button></div>
      <input value="${escapeHtml(clue.text)}" aria-label="Pista ${index + 1}" placeholder="Pista ${index + 1}: de difícil a fácil" ${locked ? "disabled" : ""} />
      <button class="remove-clue" type="button" aria-label="Eliminar pista" ${locked ? "disabled" : ""}>×</button>
    </div>`).join("");
  bindClueRows();
}

function draftCluesFromRows() {
  return $$(".admin-clue-row").map(row => ({ text: row.querySelector("input").value, revealed: false }));
}

function bindClueRows() {
  $$(".clue-order button").forEach(button => button.addEventListener("click", event => {
    const clues = draftCluesFromRows();
    const index = Number(event.currentTarget.closest(".admin-clue-row").dataset.index);
    const target = event.currentTarget.dataset.move === "up" ? index - 1 : index + 1;
    [clues[index], clues[target]] = [clues[target], clues[index]];
    renderAdminClues(clues);
  }));
  $$(".remove-clue").forEach(button => button.addEventListener("click", event => {
    const clues = draftCluesFromRows();
    clues.splice(Number(event.currentTarget.closest(".admin-clue-row").dataset.index), 1);
    renderAdminClues(clues);
  }));
}

function renderLivePanel(game) {
  const points = calculatePoints(game);
  const revealed = game?.clues.filter(clue => clue.revealed) || [];
  const next = game?.clues.find(clue => !clue.revealed);
  $("#liveQuestion").textContent = game?.question || "Publicá una pregunta para comenzar.";
  $("#livePoints").textContent = points;
  $("#liveProgressFill").style.width = `${points / 20 * 100}%`;
  $("#nextClueText").textContent = next?.text || (game?.clues.length ? "Ya usaste todas las pistas." : "Todavía no cargaste pistas.");
  $("#nextClueCard").classList.toggle("finished", !next);
  $("#revealNextClue").disabled = game?.status !== "published" || !next;
  $("#revealNextClue").textContent = next ? `Mostrar pista ${revealed.length + 1} para que Juana la lea` : "No quedan pistas";
  $("#usedClues").innerHTML = revealed.map((clue, index) => `<div class="used-clue"><span>${index + 1}</span><p>${escapeHtml(clue.text)}</p></div>`).join("");
  $("#goToWinner").disabled = game?.status !== "published";
}

function renderStorageStatus() {
  const element = $("#storageStatus");
  if (!element) return;
  element.classList.toggle("cloud", storageMode === "cloud");
  element.querySelector("b").textContent = storageMode === "cloud" ? "Sincronizado con Netlify" : "Guardado en este navegador";
  element.querySelector("small").textContent = storageMode === "cloud" ? "El equipo recibe los cambios automáticamente." : "Publicada en Netlify usará guardado compartido.";
}

function showToast(message) {
  clearTimeout(toastTimer);
  $("#toast").textContent = message;
  $("#toast").classList.add("show");
  toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 2600);
}

function setAdminTab(name, force = false) {
  const button = $(`.admin-tabs button[data-tab="${name}"]`);
  if (!button || (button.disabled && !force)) return;
  $$(".admin-tabs button").forEach(item => item.classList.toggle("active", item === button));
  $$(".tab-panel").forEach(panel => panel.classList.toggle("active", panel.dataset.panel === name));
}

function recommendedTab() { return flowStep(activeGame()); }
function openAdmin() { $("#adminDrawer").classList.add("open"); $("#adminDrawer").setAttribute("aria-hidden", "false"); setAdminTab(recommendedTab()); }
function closeAdmin() { endTour(false); $("#adminDrawer").classList.remove("open"); $("#adminDrawer").setAttribute("aria-hidden", "true"); }
function openLogin() { $("#loginModal").classList.add("open"); $("#loginModal").setAttribute("aria-hidden", "false"); setTimeout(() => $("#password").focus(), 100); }
function closeLogin() { $("#loginModal").classList.remove("open"); $("#loginModal").setAttribute("aria-hidden", "true"); $("#loginError").textContent = ""; }

const TOUR_STEPS = [
  { tab: "question", target: "#hostProgress", title: "Tu trivia, paso a paso", text: "Este recorrido marca en qué etapa estás: pregunta, pistas, juego en vivo y resultado. Podés volver a cualquier paso habilitado." },
  { tab: "question", target: "#saveQuestion", title: "1. Guardá un borrador privado", text: "Escribí la pregunta y guardala. El equipo todavía no verá nada; recién entonces se habilita la carga de pistas." },
  { tab: "clues", target: ".publish-box", title: "2. Ordená y publicá", text: "Cargá las pistas de la más difícil a la más fácil. Cuando esté todo listo, este botón publica únicamente la pregunta." },
  { tab: "live", target: "#nextClueCard", title: "3. Leé las pistas en la daily", text: "Mostrá la siguiente pista sólo en tu panel y leela en voz alta. Los participantes verán el contador, nunca el texto, para que nadie tenga ventaja." },
  { tab: "winner", target: "#awardWinner", title: "4. Cerrá con el ganador", text: "Elegí quién acertó. Calculamos los puntos según las pistas usadas y actualizamos automáticamente el ranking de todo el equipo." }
];

function startTour() {
  tourIndex = 0;
  $("#tourLayer").classList.add("open");
  $("#tourLayer").setAttribute("aria-hidden", "false");
  showTourStep();
}

function showTourStep() {
  const step = TOUR_STEPS[tourIndex];
  setAdminTab(step.tab, true);
  requestAnimationFrame(() => {
    const target = $(step.target);
    if (!target) return;
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    setTimeout(() => positionTour(target, step), 220);
  });
}

function positionTour(target, step) {
  const rect = target.getBoundingClientRect();
  const pad = 7;
  const spotlight = $("#tourSpotlight");
  Object.assign(spotlight.style, { left: `${rect.left - pad}px`, top: `${rect.top - pad}px`, width: `${rect.width + pad * 2}px`, height: `${rect.height + pad * 2}px` });
  $("#tourCount").textContent = `${tourIndex + 1} de ${TOUR_STEPS.length}`;
  $("#tourTitle").textContent = step.title;
  $("#tourText").textContent = step.text;
  $("#tourBack").style.visibility = tourIndex ? "visible" : "hidden";
  $("#tourNext").textContent = tourIndex === TOUR_STEPS.length - 1 ? "Entendido" : "Continuar";
  const card = $("#tourCard");
  const cardWidth = Math.min(380, window.innerWidth - 30);
  let left = rect.left > cardWidth + 40 ? rect.left - cardWidth - 22 : Math.max(15, Math.min(window.innerWidth - cardWidth - 15, rect.left));
  let top = Math.max(15, Math.min(window.innerHeight - 285, rect.bottom + 15));
  if (rect.bottom + 285 > window.innerHeight) top = Math.max(15, rect.top - 255);
  Object.assign(card.style, { left: `${left}px`, top: `${top}px` });
}

function endTour(restore = true) {
  $("#tourLayer").classList.remove("open");
  $("#tourLayer").setAttribute("aria-hidden", "true");
  if (restore && $("#adminDrawer").classList.contains("open")) setAdminTab(recommendedTab());
}

$("#loginButton").addEventListener("click", async () => {
  if (!isAdmin()) return openLogin();
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
  setTimeout(startTour, 350);
});

$$(".admin-tabs button").forEach(button => button.addEventListener("click", () => setAdminTab(button.dataset.tab)));
$("#skipTour").addEventListener("click", () => endTour());
$("#tourBack").addEventListener("click", () => { if (tourIndex) { tourIndex -= 1; showTourStep(); } });
$("#tourNext").addEventListener("click", () => { if (tourIndex === TOUR_STEPS.length - 1) return endTour(); tourIndex += 1; showTourStep(); });
window.addEventListener("resize", () => { if ($("#tourLayer").classList.contains("open")) showTourStep(); });

$("#saveQuestion").addEventListener("click", async () => {
  const question = $("#adminQuestion").value.trim();
  const date = $("#gameDate").value;
  if (!question || !date) return showToast("Completá la fecha y la pregunta");
  let game = activeGame();
  if (!game || game.status === "completed") {
    game = { id: `${date}-${Date.now()}`, date, question, caption: $("#adminCaption").value.trim(), clues: [], status: "draft", winner: null, pointsAwarded: null, completedAt: null };
    state.games.push(game); state.activeGameId = game.id;
  } else if (game.status === "draft" || game.status === "ready") {
    game.date = date; game.question = question; game.caption = $("#adminCaption").value.trim();
    game.status = game.clues.length ? "ready" : "draft";
  } else return showToast("La pregunta ya fue publicada");
  await persist("Borrador privado guardado");
  setAdminTab("clues");
});

$("#addClue").addEventListener("click", () => {
  const clues = draftCluesFromRows();
  clues.push({ text: "", revealed: false }); renderAdminClues(clues);
  $$(".admin-clue-row input").at(-1)?.focus();
});

$("#saveClues").addEventListener("click", async () => {
  const game = activeGame();
  if (!game) return showToast("Guardá la pregunta primero");
  if (!["draft", "ready"].includes(game.status)) return showToast("Las pistas quedaron cerradas al publicar");
  const clues = draftCluesFromRows().map(clue => ({ text: clue.text.trim(), revealed: false })).filter(clue => clue.text);
  if (!clues.length) return showToast("Agregá al menos una pista");
  game.clues = clues; game.status = "ready";
  await persist("Pistas privadas guardadas");
  setAdminTab("clues");
});

$("#publishGame").addEventListener("click", async () => {
  const game = activeGame();
  if (game?.status !== "ready" || !game.clues.length) return showToast("Guardá la pregunta y las pistas primero");
  game.status = "published"; game.publishedAt = new Date().toISOString();
  await persist("Pregunta publicada para todo el equipo");
  setAdminTab("live");
});

$("#revealNextClue").addEventListener("click", async () => {
  const game = activeGame();
  if (game?.status !== "published") return showToast("La trivia no está en juego");
  const next = game.clues.find(clue => !clue.revealed);
  if (!next) return showToast("Ya usaste todas las pistas");
  next.revealed = true;
  await persist(`Pista usada · quedan ${calculatePoints(game)} puntos`);
  setAdminTab("live");
});

$("#goToWinner").addEventListener("click", () => setAdminTab("winner"));
$("#awardWinner").addEventListener("click", async () => {
  const game = activeGame(); const winner = $("#winnerSelect").value;
  if (game?.status !== "published") return showToast("La trivia todavía no está en juego");
  if (!PARTICIPANTS.includes(winner)) return showToast("Seleccioná al participante ganador");
  game.winner = winner; game.pointsAwarded = calculatePoints(game); game.completedAt = new Date().toISOString(); game.status = "completed";
  await persist(`${winner} sumó ${game.pointsAwarded} puntos`); launchConfetti(); closeAdmin();
});

$("#undoLast").addEventListener("click", async () => {
  const last = state.games.filter(game => game.winner).sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""))[0];
  if (!last) return showToast("No hay resultados para deshacer");
  if (!confirm(`¿Quitar el resultado de ${last.winner}?`)) return;
  last.winner = null; last.pointsAwarded = null; last.completedAt = null; last.status = "published"; state.activeGameId = last.id;
  await persist("Último resultado deshecho");
});
$("#logoutButton").addEventListener("click", async () => { sessionStorage.removeItem("intuit-trivia-admin"); closeAdmin(); await loadState(); showToast("Sesión cerrada"); });

function download(filename, content, type) {
  const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([content], { type })); link.download = filename; link.click(); URL.revokeObjectURL(link.href);
}
$("#exportCsv").addEventListener("click", () => {
  const rows = [["Fecha", "Día", "Jugador", "Puntos", "Pregunta", "Pistas usadas"]];
  state.games.filter(game => game.winner).forEach(game => rows.push([game.date, formatDate(game.date).split(",")[0], game.winner, game.pointsAwarded, game.question, game.clues.filter(c => c.revealed).length]));
  const csv = "\uFEFF" + rows.map(row => row.map(value => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\r\n");
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
  $("#confetti").innerHTML = Array.from({ length: 75 }, (_, index) => `<i style="left:${Math.random() * 100}%;background:${colors[index % colors.length]};--drift:${(Math.random() - .5) * 250}px;animation-delay:${Math.random() * .65}s;transform:rotate(${Math.random() * 180}deg)"></i>`).join("");
  setTimeout(() => $("#confetti").innerHTML = "", 3500);
}

document.addEventListener("keydown", event => { if (event.key === "Escape") { if ($("#tourLayer").classList.contains("open")) endTour(); else { closeLogin(); closeAdmin(); } } });
loadState();
setInterval(refreshPublicState, REFRESH_INTERVAL);
