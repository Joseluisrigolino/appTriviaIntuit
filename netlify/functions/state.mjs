import { getStore } from "@netlify/blobs";

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
});

export default async (request) => {
  const store = getStore("intuit-trivia");

  if (request.method === "GET") {
    const state = await store.get("state", { type: "json" });
    const current = state || { version: 1, activeGameId: null, games: [], updatedAt: null };
    const expectedPassword = process.env.ADMIN_PASSWORD || "juanaadmin";
    if (request.headers.get("x-admin-password") === expectedPassword) return json(current);
    const publicState = {
      ...current,
      games: current.games.map(game => ({
        ...game,
        clues: game.clues.map(clue => ({ ...clue, text: clue.revealed ? clue.text : "" }))
      }))
    };
    return json(publicState);
  }

  if (request.method === "PUT") {
    const expectedPassword = process.env.ADMIN_PASSWORD || "juanaadmin";
    if (request.headers.get("x-admin-password") !== expectedPassword) return json({ error: "No autorizado" }, 401);
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
