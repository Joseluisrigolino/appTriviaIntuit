import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getStore } from "@netlify/blobs";

const CREDENTIALS_KEY = "admin-credentials";

function hashPassword(password, salt) {
  return scryptSync(password, salt, 64).toString("hex");
}

export async function verifyAdminPassword(password) {
  if (typeof password !== "string" || !password) return false;
  const store = getStore("intuit-trivia");
  const credentials = await store.get(CREDENTIALS_KEY, { type: "json", consistency: "strong" });
  if (!credentials?.salt || !credentials?.hash) {
    return password === (process.env.ADMIN_PASSWORD || "juanaadmin");
  }
  const candidate = Buffer.from(hashPassword(password, credentials.salt), "hex");
  const expected = Buffer.from(credentials.hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export async function changeAdminPassword(currentPassword, newPassword) {
  if (!(await verifyAdminPassword(currentPassword))) return { ok: false, error: "La contraseña actual no es correcta", status: 401 };
  if (typeof newPassword !== "string" || newPassword.length < 6 || newPassword.length > 128) {
    return { ok: false, error: "La nueva contraseña debe tener entre 6 y 128 caracteres", status: 400 };
  }
  const salt = randomBytes(16).toString("hex");
  const store = getStore("intuit-trivia");
  await store.setJSON(CREDENTIALS_KEY, { salt, hash: hashPassword(newPassword, salt), updatedAt: new Date().toISOString() });
  return { ok: true, status: 200 };
}
