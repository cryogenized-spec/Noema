import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const forbidden = [
  ["src/lib/security/secret-codec.ts", /PlainTextCodec/],
  ["src/lib/ai/provider-registry.ts", /mockProvider\s*;\s*$/m],
  ["src/app/api/agent/route.ts", /process\.env\.OPENAI_API_KEY/],
];
let failures = 0;
for (const [file, regex] of forbidden) {
  if (regex.test(readFileSync(file, "utf8"))) {
    console.error("Security regression in " + file); failures++;
  }
}
for (const file of execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0")) {
  if (!file || !/\.(?:ts|tsx|mjs|json|ya?ml|md)$/.test(file) || file === "package-lock.json") continue;
  if (/\bsk-(?:proj-)?[A-Za-z0-9_-]{30,}\b/.test(readFileSync(file, "utf8"))) {
    console.error("Possible hardcoded OpenAI key in " + file); failures++;
  }
}
if (failures) process.exit(1);
console.log("Security gates passed.");
