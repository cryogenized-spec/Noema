/** Pure, dependency-free workshop input validation. */
export function verifiedHttpsUrl(raw: string): string {
  try {
    const parsed = new URL(raw.trim());
    return parsed.protocol === "https:" && Boolean(parsed.hostname) ? parsed.toString() : "";
  } catch { return ""; }
}

export function splitWorkshopTags(raw: string): string[] {
  return [...new Set(raw.split(",").map((tag) => tag.trim()).filter(Boolean))]
    .slice(0, 24).map((tag) => tag.slice(0, 48));
}
