/** Markdown from guests or agents must not trigger automatic third-party image requests. */
export function safeExternalImageLink(url: unknown): string | null {
  if (typeof url !== "string" || url.length > 2048) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password)
      return null;
    return parsed.href;
  } catch { return null; }
}
