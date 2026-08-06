import { changeAdminPassword, verifyAdminPassword } from "../lib/admin-auth.mjs";

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
});

export default async request => {
  if (request.method !== "POST") return json({ error: "Método no permitido" }, 405);
  try {
    const body = await request.json();
    if (body.action === "login") {
      const ok = await verifyAdminPassword(body.password);
      return ok ? json({ ok: true }) : json({ error: "La contraseña no es correcta" }, 401);
    }
    if (body.action === "change") {
      const result = await changeAdminPassword(body.currentPassword, body.newPassword);
      return json(result.ok ? { ok: true } : { error: result.error }, result.status);
    }
    return json({ error: "Acción inválida" }, 400);
  } catch {
    return json({ error: "Solicitud inválida" }, 400);
  }
};
