/** Validate planned export paths before any future filesystem writer consumes them. */
const illegal = /[\u0000-\u001f\u007f<>:"|?*]/;
const windowsReserved = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i;
function safeSegment(segment: string): boolean {
  return segment.length > 0 && segment !== "." && segment !== ".." &&
    !segment.startsWith(".") && segment === segment.trim() &&
    !segment.endsWith(".") && !illegal.test(segment) && !windowsReserved.test(segment);
}
/** Directories may have explicit safe nested segments, never absolute or traversal paths. */
export function safeExportDirectory(directory: string): string {
  if (typeof directory !== "string" || !directory ||
      directory.startsWith("/") || directory.startsWith("\\") ||
      /^[A-Za-z]:/.test(directory) || directory.includes("\\")) {
    throw new Error("Unsafe export directory.");
  }
  const parts = directory.split("/");
  if (parts.length > 8 || parts.some((part) => !safeSegment(part)))
    throw new Error("Export directory contains unsafe path components.");
  return parts.join("/");
}
/** File names are precisely one path component, not slash-containing paths. */
export function safeExportFilename(filename: string): string {
  if (typeof filename !== "string" || filename.includes("/") ||
      filename.includes("\\") || !safeSegment(filename)) {
    throw new Error("Unsafe export filename.");
  }
  return filename;
}
export const safeExportPath = (directory: string, filename: string): string =>
  safeExportDirectory(directory) + "/" + safeExportFilename(filename);

/** JSON strings are valid YAML 1.2 double-quoted scalars and escape control chars. */
export function safeYamlScalar(value: string): string {
  return JSON.stringify(value);
}
export function safeYamlValue(value: string | string[]): string {
  if (typeof value === "string") return safeYamlScalar(value);
  if (Array.isArray(value) && value.every((item) => typeof item === "string"))
    return JSON.stringify(value);
  throw new Error("Unsupported YAML frontmatter value.");
}
export function safeYamlKey(key: string): string {
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(key) ||
      ["constructor", "prototype", "__proto__"].includes(key.toLowerCase()))
    throw new Error("Unsafe YAML frontmatter key.");
  return key;
}
export function safeDatePrefix(value: string): string {
  const prefix = typeof value === "string" ? value.slice(0, 10) : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(prefix) ? prefix : "undated";
}

/** Parse our JSON-compatible safe YAML scalars; keep a narrow fallback for old exports. */
export function parseSafeYamlValue (value: string): string | string[] | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('"') || trimmed.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (typeof parsed === "string") return parsed;
      if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string"))
        return parsed;
    } catch { /* Legacy YAML quoting: handle below without executing YAML tags. */ }
  }
  if (trimmed.startsWith("[") && trimmed.endsWith("]"))
    return trimmed.slice(1,-1).split(",")
      .map((item) => item.trim().replace(/^"|"$/g, "")).filter(Boolean);
  if (trimmed.startsWith('"') && trimmed.endsWith('"'))
    return trimmed.slice(1,-1).replace(/\\"/g,'"');
  return trimmed;
}
