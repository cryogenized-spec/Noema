/** Local-only development gateway. Never use this to authenticate public clients. */
export function isLocalDevelopmentGatewayRequest(request: Request): boolean {
  if (process.env.NODE_ENV !== "development" ||
      process.env.NOEMA_ENABLE_BYOK_AGENT_PROXY !== "true") return false;
  let url: URL;
  let origin: URL;
  try {
    url = new URL(request.url);
    const source = request.headers.get("origin");
    if (!source) return false; // No Origin = non-browser or forged/ambiguous request.
    origin = new URL(source);
  } catch { return false; }
  const host = url.hostname.toLowerCase();
  if (host !== "localhost" && host !== "127.0.0.1" && host !== "[::1]") return false;
  return origin.origin === url.origin;
}
