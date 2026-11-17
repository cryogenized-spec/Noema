import { isIP } from "node:net";

/**
 * Guard against SSRF before connecting to RSS sources. The transport must pin
 * a vetted IPv4 address via Node's HTTPS lookup callback: validation alone
 * followed by an unrelated fetch() DNS resolution would permit DNS rebinding.
 */
export function safeRssSourceUrl(input: string): URL {
  if (input.length > 2048) throw new Error("Feed URL is too long.");
  let url: URL;
  try { url = new URL(input.trim()); }
  catch { throw new Error("Enter a valid feed URL."); }
  if (url.protocol !== "https:" || url.port || url.username || url.password)
    throw new Error("Only ordinary HTTPS feed URLs are supported.");
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname.includes(".") || isIP(hostname) || /(?:^|\.)(?:localhost|local|internal|test|invalid|example|onion|arpa)$/.test(hostname)
    || hostname.includes("%") || hostname.includes(":") || hostname.includes("[") || hostname.length > 253)
    throw new Error("The requested feed host is not allowed.");
  url.hash = "";
  return url;
}

/** Public-routable IPv4 only. Reject special-use, private, multicast and
 * documentation ranges even if a hostile DNS record points at them.
 */
export function isPublicRssIPv4(address: string): boolean {
  if (isIP(address) !== 4) return false;
  const octets = address.split(".").map(Number);
  const [a, b, c] = octets;
  if (a === undefined || b === undefined || c === undefined) return false;
  if (a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 168 || b === 0 && (c === 0 || c === 2) || b === 88 && c === 99)) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 198 && (b === 18 || b === 19 || b === 51 && c === 100)) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}
