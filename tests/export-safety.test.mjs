import { test } from "node:test";
import assert from "node:assert/strict";
import {
  safeExportPath, safeExportFilename, safeExportDirectory,
  safeYamlValue, safeYamlKey, safeDatePrefix,
} from "../src/lib/security/export-safety.ts";
import { safeExternalImageLink } from "../src/lib/security/markdown-url.ts";
test("safe export paths allow ordinary names and nested directories", () => {
  assert.equal(safeExportPath("Notes/2026","draft 1.md"), "Notes/2026/draft 1.md");
  assert.equal(safeExportDirectory("Assets"),"Assets");
  assert.equal(safeExportFilename("flower.png"),"flower.png");
});
test("cannot traverse, overwrite sensitive hidden files, or write absolute files", () => {
  const bad = ["../private", "Notes/../private", "/etc", "C:/Windows", "Notes\\\\escape",
    "Assets//sub", "Notes/.", ".git", "CON", "LPT1.txt", "assets/../../../secret"];
  for (const value of bad) {
    assert.throws(() => safeExportDirectory(value), value);
    assert.throws(() => safeExportFilename(value), value);
  }
  assert.throws(() => safeExportPath("Assets", "../../key.txt"));
  assert.throws(() => safeExportPath("../outside", "note.md"));
  assert.equal(safeDatePrefix("../../../../etc"), "undated");
});
test("YAML values cannot inject new metadata or closing markers", () => {
  const input = 'tag\\n---\\nadmin: true\\\\value "quoted"';
  const output = safeYamlValue(input);
  assert.equal(output, JSON.stringify(input));
  assert.equal(output.includes("\n---\n"),false);
  assert.equal(safeYamlValue(["x", input]),JSON.stringify(["x",input]));
  assert.equal(safeYamlKey("title"),"title");
  assert.throws(() => safeYamlKey("title:\\n---"));
  assert.throws(() => safeYamlKey("__proto__"));
});
test("markdown cannot auto-load remote image resources; clickable link is HTTPS only", () => {
  assert.equal(safeExternalImageLink("https://cdn.example/image.png"),"https://cdn.example/image.png");
  for (const unsafe of ["http://cdn.example/tracker.png","javascript:alert(1)",
    "data:image/svg+xml;base64,AAAA","https://user:pass@cdn.example/x","/internal.png"]) {
    assert.equal(safeExternalImageLink(unsafe),null);
  }
});
