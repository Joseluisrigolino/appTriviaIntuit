import { getStore } from "@netlify/blobs";
import { verifyAdminPassword } from "../lib/admin-auth.mjs";

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
});

export default async (request) => {
  const store = getStore("intuit-trivia");

  if (request.method === "GET") {
    const state = await store.get("state", { type: "json", consistency: "strong" });
    const current = state || { version: 3, activeGameId: null, games: [], categories: [], updatedAt: null };
    if (await verifyAdminPassword(request.headers.get("x-admin-password"))) return json(current);
    const active = current.games.find(game => game.id === current.activeGameId);
    const isActivePublic = active && ["published", "completed"].includes(active.status || (active.winner ? "completed" : "published"));
    const publicState = {
      ...current,
      activeGameId: isActivePublic ? current.activeGameId : null,
      games: current.games.filter(game => ["published", "completed"].includes(game.status || (game.winner ? "completed" : "published"))).map(game => ({
        ...game,
        answer: game.status === "completed" ? game.answer || "" : "",
        clues: game.clues.map(clue => ({
          ...clue,
          text: game.status === "completed" && clue.revealed ? clue.text : ""
        }))
      }))
    };
    return json(publicState);
  }

  if (request.method === "PUT") {
    if (!(await verifyAdminPassword(request.headers.get("x-admin-password")))) return json({ error: "No autorizado" }, 401);
    try {
      const state = await request.json();
      if (!state || !Array.isArray(state.games) || JSON.stringify(state).length > 500_000) return json({ error: "Estado inválido" }, 400);
      await store.setJSON("state", state);
      return json({ ok: true });
    } catch {
      return json({ error: "JSON inválido" }, 400);
    }
  }

  return json({ error: "Método no permitido" }, 405);
};
