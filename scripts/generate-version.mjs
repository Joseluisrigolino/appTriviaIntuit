import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const [major, minor] = packageJson.version.split(".");

let revision = process.env.BUILD_NUMBER || "dev";
try {
  revision = execFileSync("git", ["rev-list", "--count", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
} catch {
  // Netlify always has Git metadata; this fallback keeps local previews readable.
}

const version = `${major}.${minor}.${revision}`;
writeFileSync(join(root, "version.js"), `globalThis.APP_VERSION = ${JSON.stringify(version)};\n`, "utf8");
console.log(`Intuit Trivia Club v${version}`);
