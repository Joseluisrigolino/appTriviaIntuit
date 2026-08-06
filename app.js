import { createInitialState, DATASET_REVISION } from "./data/initial-state.js";

const PARTICIPANTS = [
  "Daniel Gonzalez", "Jose Rigolino", "Juan Pereyra", "Julieta Ramos",
  "Julio Costas", "Marisa Cinque", "Marisol Galain", "Sebastian Romano", "Thiago Santero"
];
const PARTICIPANT_PHOTOS = {
  "Daniel Gonzalez": "assets/participants/daniel-gonzalez.png",
  "Jose Rigolino": "assets/participants/jose-rigolino.png",
  "Juan Pereyra": "assets/participants/juan-pereyra.png",
  "Julieta Ramos": "assets/participants/julieta-ramos.png",
  "Julio Costas": "assets/participants/julio-costas.png",
  "Marisa Cinque": "assets/participants/marisa-cinque.png",
  "Marisol Galain": "assets/participants/marisol-galain.png",
  "Sebastian Romano": "assets/participants/sebastian-romano.png",
  "Thiago Santero": "assets/participants/thiago-santero.png"
};
const INITIAL_ADMIN_PASSWORD = "juanaadmin";
const STORAGE_KEY = "intuit-trivia-state-v3";
const LOCAL_PASSWORD_KEY = "intuit-trivia-local-password";
const API_URL = "/api/state";
const AUTH_URL = "/api/auth";
const REFRESH_INTERVAL = 4000;
const APP_VERSION = globalThis.APP_VERSION || "2.1.dev";

const defaultState = createInitialState;
let state = defaultState();
let storageMode = "local";
let toastTimer;
let tourIndex = 0;
let editingCategoryId = null;

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const formatDate = (date, long = true) => new Intl.DateTimeFormat("es-AR", long ? { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" } : { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
const initials = name => name.split(" ").map(part => part[0]).slice(0, 2).join("");
const avatarSlug = name => name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-");
const avatarMarkup = name => PARTICIPANT_PHOTOS[name]
  ? `<span class="avatar avatar-${avatarSlug(name)}"><img src="${PARTICIPANT_PHOTOS[name]}" alt="" loading="lazy" /></span>`
  : `<span class="avatar">${initials(name)}</span>`;
const activeGame = () => state.games.find(game => game.id === state.activeGameId) || null;
const isAdmin = () => Boolean(sessionStorage.getItem("intuit-trivia-admin"));

$("#appVersion").textContent = `v${APP_VERSION}`;

function normalizeState(raw) {
  if (!raw || !Array.isArray(raw.games)) return defaultState();
  let games = raw.games.map(game => ({
    ...game,
    status: game.status || (game.winner ? "completed" : "published"),
    answer: typeof game.answer === "string" ? game.answer.trim() : "",
    unanswered: Boolean(game.unanswered),
    category: typeof game.category === "string" ? game.category.trim() : "",
    bonusPercent: Math.max(0, Math.min(200, Number(game.bonusPercent) || 0)),
    clues: Array.isArray(game.clues) ? game.clues.map(clue => typeof clue === "string" ? { text: clue, revealed: false } : { text: clue.text || "", revealed: Boolean(clue.revealed) }) : [],
    winner: PARTICIPANTS.includes(game.winner) ? game.winner : null
  }));
  const hasCategoryCatalog = Array.isArray(raw.categories);
  const categories = hasCategoryCatalog ? raw.categories.filter(category => category?.name).map((category, index) => ({
    id: String(category.id || `category-${index}`),
    name: String(category.name).trim(),
    bonusPercent: Math.max(0, Math.min(200, Number(category.bonusPercent) || 0))
  })) : [];
  if (!hasCategoryCatalog) games.forEach((game, index) => {
    if (!game.category || categories.some(category => category.name.toLowerCase() === game.category.toLowerCase())) return;
    categories.push({ id: `legacy-${index}-${game.category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, name: game.category, bonusPercent: categoryBonus(game) });
  });
  games = games.map(game => ({ ...game, categoryId: game.categoryId || categories.find(category => category.name.toLowerCase() === game.category?.toLowerCase())?.id || "" }));
  return {
    version: 3,
    datasetRevision: Math.max(DATASET_REVISION, Number(raw.datasetRevision) || 0),
    activeGameId: raw.activeGameId || null,
    updatedAt: raw.updatedAt || null,
    games,
    categories
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
  if (storageMode !== "cloud") return true;
  try {
    state = await fetchState(sessionStorage.getItem("intuit-trivia-admin") || "");
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render();
    return true;
  } catch {
    showToast("La sesión de Juana venció o cambió la contraseña");
    return false;
  }
}

async function authenticateAdmin(password) {
  if (storageMode === "local") return password === (localStorage.getItem(LOCAL_PASSWORD_KEY) || INITIAL_ADMIN_PASSWORD);
  try {
    const response = await fetch(AUTH_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "login", password }) });
    return response.ok;
  } catch { return false; }
}

async function updateAdminPassword(currentPassword, newPassword) {
  if (storageMode === "local") {
    if (currentPassword !== (localStorage.getItem(LOCAL_PASSWORD_KEY) || INITIAL_ADMIN_PASSWORD)) return { ok: false, error: "La contraseña actual no es correcta" };
    localStorage.setItem(LOCAL_PASSWORD_KEY, newPassword);
    return { ok: true };
  }
  try {
    const response = await fetch(AUTH_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "change", currentPassword, newPassword }) });
    const result = await response.json();
    return response.ok ? { ok: true } : { ok: false, error: result.error || "No se pudo cambiar la contraseña" };
  } catch { return { ok: false, error: "No se pudo conectar con el guardado compartido" }; }
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
    if (response.status === 401) {
      sessionStorage.removeItem("intuit-trivia-admin");
      closeAdmin();
      await loadState();
      openLogin();
      showToast("La contraseña cambió · volvé a iniciar sesión");
      return;
    }
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
  const basePoints = total ? 20 * (total + 1 - revealed) / (total + 1) : 20;
  return Math.max(1, Math.round(basePoints * (1 + categoryBonus(game) / 100)));
}

function categoryBonus(game) {
  return Math.max(0, Math.min(200, Number(game?.bonusPercent) || 0));
}

function maxPoints(game) {
  return Math.round(20 * (1 + categoryBonus(game) / 100));
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
  renderRaceBoard();
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
  const availablePoints = game ? (completed ? game.pointsAwarded : points) : "?";
  $("#currentPoints").textContent = availablePoints;
  $("#heroPoints").textContent = availablePoints;
  $("#meterPoints").textContent = game ? `${availablePoints} puntos disponibles` : "La categoría define el puntaje";
  $("#pointsMeterFill").style.width = game ? `${availablePoints / maxPoints(game) * 100}%` : "0%";
  $("#questionNumber").textContent = game ? String(state.games.findIndex(item => item.id === game.id) + 1).padStart(2, "0") : "—";
  $("#questionCategory").textContent = game?.category ? `${game.category.toUpperCase()}${categoryBonus(game) ? ` · +${categoryBonus(game)}%` : ""}` : "CATEGORÍA LIBRE";
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
  status.innerHTML = completed ? (game.unanswered ? `<span></span> Nadie encontró la respuesta · 0 puntos` : `<span></span> Respondió ${escapeHtml(game.winner)} · ${game.pointsAwarded} puntos`) : `<span></span> ${game ? "El equipo está adivinando" : "Esperando la pregunta"}`;
  $("#answerReveal").hidden = !completed || !game?.answer;
  $("#answerRevealText").textContent = completed ? game?.answer || "" : "";
}

function boardProgress(points) {
  if (!points) return { position: 0, lap: 1 };
  const remainder = points % 100;
  if (remainder === 0) return { position: 23, lap: Math.max(1, points / 100) };
  return { position: Math.round(remainder / 100 * 23), lap: Math.floor(points / 100) + 1 };
}

function renderRaceBoard() {
  const people = scoresByParticipant();
  const cells = Array.from({ length: 24 }, () => []);
  people.forEach(person => {
    const progress = boardProgress(person.points);
    cells[progress.position].push({ ...person, lap: progress.lap });
  });
  const coordinates = [
    [29, 10, 0], [37.4, 10, 0], [45.8, 10, 0], [54.2, 10, 0], [62.6, 10, 0], [71, 10, 0],
    [77, 18, 52], [83.5, 28, 52], [88.5, 39, 72],
    [88.5, 51, 108], [83.5, 62, 128], [77, 72, 128],
    [71, 82, 0], [62.6, 82, 0], [54.2, 82, 0], [45.8, 82, 0], [37.4, 82, 0], [29, 82, 0],
    [23, 72, 52], [16.5, 62, 52], [11.5, 51, 72],
    [11.5, 37, 108], [16.5, 27, 128], [23, 17.5, 128]
  ];
  const leader = people[0];
  const trophy = `<svg viewBox="0 0 72 58" aria-hidden="true"><path class="trophy-cup" d="M24 6h24v10c0 11-5 18-12 21-7-3-12-10-12-21V6Z"/><path class="trophy-handle" d="M24 11h-9v6c0 7 4 12 11 13M48 11h9v6c0 7-4 12-11 13"/><path class="trophy-stem" d="M36 37v9m-10 6h20M30 46h12"/></svg>`;
  const reachTrophy = `<svg class="reach-trophy" viewBox="0 0 94 60" aria-hidden="true"><path class="reach-hand" d="M2 54c5-10 10-17 17-20 4-2 8 0 9 4l4 14-9 3-4-10-7 12Z"/><path class="reach-hand" d="M92 54c-5-10-10-17-17-20-4-2-8 0-9 4l-4 14 9 3 4-10 7 12Z"/><path class="reach-cup" d="M35 4h24v10c0 11-5 18-12 21-7-3-12-10-12-21V4Z"/><path class="reach-cup-line" d="M35 9h-9v6c0 7 4 12 11 13M59 9h9v6c0 7-4 12-11 13M47 35v10m-10 7h20M40 45h14"/></svg>`;
  const leaderMarkup = leader?.points
    ? `<div class="board-leader">${avatarMarkup(leader.name)}<span><small>MÁS CERCA DE LA COPA</small><b>${escapeHtml(leader.name)} · ${leader.points} pts</b></span>${reachTrophy}</div>`
    : `<div class="board-leader board-leader-empty"><span>🏁</span><b>Todos listos en la largada</b></div>`;
  const center = `<div class="board-center"><span class="board-center-logo"><svg viewBox="0 0 120 72" aria-hidden="true"><path d="M13 51a23 23 0 0 1 46 0H13Z"/><path d="M61 23h46a23 23 0 0 1-46 0Z"/><path d="M61 26h-8v5c0 8 5 14 13 16l2-5c-5-1-8-5-8-11h1v-5Zm46 0h8v5c0 8-5 14-13 16l-2-5c5-1 8-5 8-11h-1v-5ZM81 44h6v11h10v6H71v-6h10V44Z"/></svg></span><span class="kicker">CAMPEONATO</span><h3>Carrera<br />de mente</h3><p>Cada vuelta tiene 100 puntos. La copa sigue en juego y la mente que más suma es la que más cerca está de alcanzarla.</p>${leaderMarkup}</div>`;
  const tones = ["deep", "purple", "violet", "lavender", "purple", "lime", "purple", "violet", "lavender", "purple", "violet", "coral", "deep", "purple", "violet", "lavender", "purple", "lime", "purple", "violet", "lavender", "purple", "violet", "purple"];
  const trackCells = coordinates.map(([x, y, rotation], index) => {
    const tokens = cells[index].map(person => {
      const isLeader = Boolean(leader?.points && person.name === leader.name);
      return `<span class="board-token avatar-${avatarSlug(person.name)}${isLeader ? " board-token-leader" : ""}" title="${escapeHtml(person.name)} · ${person.points} puntos"><img src="${PARTICIPANT_PHOTOS[person.name]}" alt="${escapeHtml(person.name)}" loading="lazy" />${isLeader ? `<i class="leader-mini-cup">${trophy}</i>` : ""}${person.lap > 1 ? `<i class="lap-badge">V${person.lap}</i>` : ""}</span>`;
    }).join("");
    const value = Math.round(index / 23 * 100);
    return `<div class="board-cell track-${tones[index]} ${index === 0 ? "start-cell" : ""} ${index === 23 ? "finish-cell" : ""} ${cells[index].length > 4 ? "crowded" : ""}" style="--x:${x};--y:${y};--r:${rotation}deg">${index === 0 ? `<span class="cell-flag">SALIDA</span>` : index === 23 ? `<span class="cell-flag">META</span><i class="board-goal">${trophy}</i>` : ""}<div class="token-stack">${tokens}</div><span class="cell-points">${value}</span></div>`;
  }).join("");
  $("#raceBoard").innerHTML = `<div class="race-track"><div class="track-aura"></div>${trackCells}${center}</div>`;
}

function renderLeaderboard() {
  $("#leaderboard").innerHTML = scoresByParticipant().map((person, index) => `
    <div class="rank-row">
      <span class="rank-position">${index === 0 ? "♛" : String(index + 1).padStart(2, "0")}</span>
      <div class="rank-person">${avatarMarkup(person.name)}<span>${escapeHtml(person.name)}</span></div>
      <div class="rank-meta"><small>VICTORIAS</small><b>${person.wins}</b></div>
      <div class="rank-points">${person.points} <small>PTS</small></div>
    </div>`).join("");
}

function renderHistory() {
  const completed = state.games.filter(game => game.status === "completed").sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  $("#historyGrid").innerHTML = completed.map(game => `
    <article class="history-card">
      <div class="history-date"><span>${formatDate(game.date, false).toUpperCase()}</span><span>${game.clues.filter(c => c.revealed).length} PISTAS</span></div>
      <span class="history-category">${escapeHtml(game.category || "Categoría libre")}${categoryBonus(game) ? ` · +${categoryBonus(game)}%` : ""}</span>
      <h3>${escapeHtml(game.question)}</h3>
      ${game.answer ? `<p class="history-answer"><b>Respuesta:</b> ${escapeHtml(game.answer)}</p>` : ""}
      <div class="history-winner">${game.unanswered ? `<span class="avatar">?</span><span>Nadie respondió</span><b>0 pts</b>` : `${avatarMarkup(game.winner)}<span>${escapeHtml(game.winner)}</span><b>+${game.pointsAwarded} pts</b>`}</div>
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
  renderCategoryOptions();
  $("#gameDate").value = game?.date || today();
  $("#adminQuestion").value = game?.question || "";
  $("#adminAnswer").value = game?.answer || "";
  $("#adminCaption").value = game?.caption || "";
  $("#adminCategory").value = game?.categoryId || state.categories.find(category => category.name.toLowerCase() === game?.category?.toLowerCase())?.id || "";
  $("#gameDate").disabled = locked;
  $("#adminQuestion").disabled = locked;
  $("#adminAnswer").disabled = locked;
  $("#adminCaption").disabled = locked;
  $("#adminCategory").disabled = locked;
  $("#saveQuestion").disabled = locked;
  $("#saveQuestion").textContent = locked ? "Pregunta ya publicada" : "Guardar pregunta y continuar";
  $("#adminPoints").textContent = calculatePoints(game);
  $("#adminBonusSummary").textContent = categoryBonus(game) ? `+${categoryBonus(game)}% ${game?.category || "extra"}` : "Sin extra";
  $("#winnerSelect").innerHTML = `<option value="">Seleccionar resultado</option><option value="__unanswered__" ${game?.unanswered ? "selected" : ""}>Nadie respondió · 0 puntos</option>${PARTICIPANTS.map(name => `<option value="${escapeHtml(name)}" ${game?.winner === name ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}`;
  $("#awardWinner").disabled = game?.status !== "published";
  $("#awardWinner").textContent = game?.status === "completed" ? (game.unanswered ? "Cerrada sin respuesta" : `Resultado cargado: ${game.winner}`) : "Confirmar resultado";
  $("#winnerSummary").textContent = game ? `${game.clues.filter(c => c.revealed).length} de ${game.clues.length} pistas usadas${categoryBonus(game) ? ` · bonus de categoría +${categoryBonus(game)}% incluido` : ""}.` : "Primero prepará y publicá una pregunta.";
  $("#addClue").disabled = !game || locked;
  $("#saveClues").disabled = !game || locked;
  $("#publishGame").disabled = game?.status !== "ready" || !game.clues.length;
  renderAdminClues(game?.clues || [], locked);
  renderLivePanel(game);
  renderCategoryLibrary();
  updateCategoryHelp();

  const allowed = {
    question: true,
    clues: Boolean(game),
    live: game?.status === "published" || game?.status === "completed",
    winner: game?.status === "published" || game?.status === "completed",
    categories: true,
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
  $("#liveProgressFill").style.width = `${points / maxPoints(game) * 100}%`;
  $("#nextClueText").textContent = next?.text || (game?.clues.length ? "Ya usaste todas las pistas." : "Todavía no cargaste pistas.");
  $("#nextClueCard").classList.toggle("finished", !next);
  $("#revealNextClue").disabled = game?.status !== "published" || !next;
  $("#revealNextClue").textContent = next ? `Mostrar pista ${revealed.length + 1} para que Juana la lea` : "No quedan pistas";
  $("#usedClues").innerHTML = revealed.map((clue, index) => `<div class="used-clue"><span>${index + 1}</span><p>${escapeHtml(clue.text)}</p></div>`).join("");
  $("#goToWinner").disabled = game?.status !== "published";
}

function renderCategoryOptions() {
  $("#adminCategory").innerHTML = `<option value="">Elegí una categoría</option>${state.categories.map(category => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)} · +${category.bonusPercent}%</option>`).join("")}`;
}

function updateCategoryHelp() {
  const category = state.categories.find(item => item.id === $("#adminCategory").value);
  const bonus = category?.bonusPercent || 0;
  const initial = Math.round(20 * (1 + bonus / 100));
  $("#categoryHelp").textContent = category ? `${category.name} agrega ${bonus}%: esta pregunta comenzará valiendo ${initial} puntos.` : "Cargá las categorías una sola vez y después elegilas desde acá.";
}

function updateNewCategoryHelp() {
  const bonus = Math.max(0, Math.min(200, Number($("#newCategoryBonus").value) || 0));
  $("#newCategoryHelp").textContent = `Con ${bonus}%, las preguntas de esta categoría comienzan en ${Math.round(20 * (1 + bonus / 100))} puntos.`;
}

function renderCategoryLibrary() {
  $("#categoryList").innerHTML = state.categories.map(category => `
    <div class="category-row" data-category-id="${escapeHtml(category.id)}">
      <span>✦</span><div><b>${escapeHtml(category.name)}</b><small>Comienza en ${Math.round(20 * (1 + category.bonusPercent / 100))} pts · +${category.bonusPercent}%</small></div>
      <button class="edit-category" type="button" aria-label="Editar ${escapeHtml(category.name)}">✎</button>
      <button class="delete-category" type="button" aria-label="Eliminar ${escapeHtml(category.name)}">×</button>
    </div>`).join("");
  $$(".edit-category").forEach(button => button.addEventListener("click", event => {
    const category = state.categories.find(item => item.id === event.currentTarget.closest(".category-row").dataset.categoryId);
    if (!category) return;
    editingCategoryId = category.id;
    $("#categoryName").value = category.name;
    $("#newCategoryBonus").value = category.bonusPercent;
    $("#saveCategory").textContent = "Actualizar categoría";
    updateNewCategoryHelp();
    $("#categoryName").focus();
  }));
  $$(".delete-category").forEach(button => button.addEventListener("click", async event => {
    const id = event.currentTarget.closest(".category-row").dataset.categoryId;
    const category = state.categories.find(item => item.id === id);
    if (!category || !confirm(`¿Eliminar la categoría ${category.name}? Las partidas anteriores conservarán sus puntos.`)) return;
    state.categories = state.categories.filter(item => item.id !== id);
    if (editingCategoryId === id) resetCategoryForm();
    await persist("Categoría eliminada");
    setAdminTab("categories");
  }));
}

function resetCategoryForm() {
  editingCategoryId = null;
  $("#categoryName").value = "";
  $("#newCategoryBonus").value = "0";
  $("#saveCategory").textContent = "Guardar categoría";
  updateNewCategoryHelp();
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
  { tab: "categories", target: "#categoryManager", title: "Primero: creá tus categorías", text: "Esto se hace una sola vez. Y por lo que tengo entendido, en la daily saben demasiado de fútbol: no les regales ventaja con un extra ahí. Para las demás categorías… evaluá cuánto sufren." },
  { tab: "question", target: "#hostProgress", title: "Tu trivia, paso a paso", text: "Este recorrido marca en qué etapa estás: pregunta, pistas, juego en vivo y resultado. Podés volver a cualquier paso habilitado." },
  { tab: "question", target: "#categoryConfig", title: "1. Elegí desde tu biblioteca", text: "Seleccioná una categoría ya cargada. Su extra se aplica automáticamente: acá no tenés que volver a escribir ningún porcentaje." },
  { tab: "question", target: "#saveQuestion", title: "2. Guardá pregunta y respuesta", text: "Escribí ambas y guardá el borrador. La respuesta permanece privada durante el juego y recién aparece en el historial cuando cierres la partida." },
  { tab: "clues", target: ".publish-box", title: "3. Ordená y publicá", text: "Cargá las pistas de la más difícil a la más fácil. Cuando esté todo listo, este botón publica únicamente la pregunta." },
  { tab: "live", target: "#nextClueCard", title: "4. Leé las pistas en la daily", text: "Mostrá la siguiente pista sólo en tu panel y leela en voz alta. Los participantes verán el contador, nunca el texto, para que nadie tenga ventaja." },
  { tab: "winner", target: "#awardWinner", title: "5. Cerrá con el ganador", text: "Elegí quién acertó. Calculamos pistas y bonus de categoría, y actualizamos automáticamente el ranking de todo el equipo." },
  { tab: "data", target: ".password-prank-card", title: "Último detalle: cambiá tu contraseña", text: "José y Seba ya conocen la clave inicial. Antes de estrenar la trivia, cambiala desde acá para que nadie se haga el vivo tocando preguntas o puntos." }
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
  if (!(await loadAdminState())) { sessionStorage.removeItem("intuit-trivia-admin"); return openLogin(); }
  openAdmin();
});
$("#closeLogin").addEventListener("click", closeLogin);
$("#loginModal").addEventListener("click", event => { if (event.target.id === "loginModal") closeLogin(); });
$("#closeAdmin").addEventListener("click", closeAdmin);
$("#togglePassword").addEventListener("click", () => { $("#password").type = $("#password").type === "password" ? "text" : "password"; });
$("#loginForm").addEventListener("submit", async event => {
  event.preventDefault();
  const password = $("#password").value;
  $("#loginError").textContent = "Comprobando…";
  if (!(await authenticateAdmin(password))) { $("#loginError").textContent = "La contraseña no es correcta."; return; }
  sessionStorage.setItem("intuit-trivia-admin", password);
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
  const answer = $("#adminAnswer").value.trim();
  const date = $("#gameDate").value;
  const categoryId = $("#adminCategory").value;
  const selectedCategory = state.categories.find(category => category.id === categoryId);
  if (!question || !answer || !date) return showToast("Completá la fecha, la pregunta y la respuesta");
  if (!selectedCategory) return showToast("Elegí una categoría de la biblioteca");
  let game = activeGame();
  if (!game || game.status === "completed") {
    game = { id: `${date}-${Date.now()}`, date, question, answer, caption: $("#adminCaption").value.trim(), categoryId, category: selectedCategory.name, bonusPercent: selectedCategory.bonusPercent, clues: [], status: "draft", winner: null, unanswered: false, pointsAwarded: null, completedAt: null };
    state.games.push(game); state.activeGameId = game.id;
  } else if (game.status === "draft" || game.status === "ready") {
    game.date = date; game.question = question; game.answer = answer; game.caption = $("#adminCaption").value.trim(); game.categoryId = categoryId; game.category = selectedCategory.name; game.bonusPercent = selectedCategory.bonusPercent;
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

$("#adminCategory").addEventListener("change", updateCategoryHelp);
$("#openCategories").addEventListener("click", () => setAdminTab("categories"));
$("#newCategoryBonus").addEventListener("input", updateNewCategoryHelp);
$("#saveCategory").addEventListener("click", async () => {
  const name = $("#categoryName").value.trim();
  const bonusPercent = Math.max(0, Math.min(200, Number($("#newCategoryBonus").value) || 0));
  const wasEditing = Boolean(editingCategoryId);
  if (!name) return showToast("Escribí el nombre de la categoría");
  const duplicate = state.categories.find(category => category.name.toLowerCase() === name.toLowerCase() && category.id !== editingCategoryId);
  if (duplicate) return showToast("Esa categoría ya está guardada");
  if (editingCategoryId) {
    const category = state.categories.find(item => item.id === editingCategoryId);
    if (!category) return;
    category.name = name; category.bonusPercent = bonusPercent;
    state.games.filter(game => game.categoryId === category.id && ["draft", "ready"].includes(game.status)).forEach(game => { game.category = name; game.bonusPercent = bonusPercent; });
  } else {
    state.categories.push({ id: `category-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name, bonusPercent });
  }
  resetCategoryForm();
  await persist(wasEditing ? "Categoría actualizada" : "Categoría guardada");
  setAdminTab("categories");
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
  if (winner !== "__unanswered__" && !PARTICIPANTS.includes(winner)) return showToast("Seleccioná un ganador o marcá que nadie respondió");
  game.unanswered = winner === "__unanswered__";
  game.winner = game.unanswered ? null : winner;
  game.pointsAwarded = game.unanswered ? 0 : calculatePoints(game);
  game.completedAt = new Date().toISOString(); game.status = "completed";
  await persist(game.unanswered ? "Pregunta cerrada sin respuesta" : `${winner} sumó ${game.pointsAwarded} puntos`);
  if (!game.unanswered) launchConfetti();
  closeAdmin();
});

$("#undoLast").addEventListener("click", async () => {
  const last = state.games.filter(game => game.status === "completed").sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""))[0];
  if (!last) return showToast("No hay resultados para deshacer");
  if (!confirm(`¿Quitar el resultado de ${last.unanswered ? "la pregunta sin responder" : last.winner}?`)) return;
  last.winner = null; last.unanswered = false; last.pointsAwarded = null; last.completedAt = null; last.status = "published"; state.activeGameId = last.id;
  await persist("Último resultado deshecho");
});
$("#changePasswordButton").addEventListener("click", () => {
  const form = $("#passwordChangeForm");
  form.hidden = !form.hidden;
  $("#changePasswordButton").textContent = form.hidden ? "Cambiar la contraseña secreta" : "Mejor la cambio después";
  $("#passwordChangeError").textContent = "";
  if (!form.hidden) $("#currentAdminPassword").focus();
});
$("#passwordChangeForm").addEventListener("submit", async event => {
  event.preventDefault();
  const currentPassword = $("#currentAdminPassword").value;
  const newPassword = $("#newAdminPassword").value;
  const confirmation = $("#confirmAdminPassword").value;
  const error = $("#passwordChangeError");
  if (newPassword.length < 6) { error.textContent = "Usá al menos 6 caracteres para que Seba no la adivine en dos intentos."; return; }
  if (newPassword !== confirmation) { error.textContent = "Las dos contraseñas nuevas no coinciden."; return; }
  error.textContent = "Cambiando la cerradura…";
  const result = await updateAdminPassword(currentPassword, newPassword);
  if (!result.ok) { error.textContent = result.error; return; }
  sessionStorage.setItem("intuit-trivia-admin", newPassword);
  event.currentTarget.reset();
  event.currentTarget.hidden = true;
  $("#changePasswordButton").textContent = "Cambiar la contraseña secreta";
  showToast("Contraseña cambiada · José y Seba quedaron afuera 😏");
});
$("#logoutButton").addEventListener("click", async () => { sessionStorage.removeItem("intuit-trivia-admin"); closeAdmin(); await loadState(); showToast("Sesión cerrada"); });

function download(filename, content, type) {
  const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([content], { type })); link.download = filename; link.click(); URL.revokeObjectURL(link.href);
}
$("#exportCsv").addEventListener("click", () => {
  const rows = [["Fecha", "Día", "Jugador", "Puntos", "Categoría", "Extra categoría", "Pregunta", "Respuesta", "Pistas usadas"]];
  state.games.filter(game => game.status === "completed").forEach(game => rows.push([game.date, formatDate(game.date).split(",")[0], game.unanswered ? "Sin respuesta" : game.winner, game.pointsAwarded || 0, game.category || "", `${categoryBonus(game)}%`, game.question, game.answer || "", game.clues.filter(c => c.revealed).length]));
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
$$('[data-ranking-view]').forEach(button => button.addEventListener("click", () => {
  $$('[data-ranking-view]').forEach(item => item.classList.toggle("active", item === button));
  $$('[data-ranking-panel]').forEach(panel => panel.classList.toggle("active", panel.dataset.rankingPanel === button.dataset.rankingView));
}));
loadState();
setInterval(refreshPublicState, REFRESH_INTERVAL);
