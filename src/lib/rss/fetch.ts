import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { safeRssSourceUrl, isPublicRssIPv4 } from "./security";

export const MAX_RSS_BYTES = 900_000;
const MAX_HOPS = 3;
const REQUEST_TIMEOUT_MS = 9_000;

/** A DNS-pinned HTTPS transport: every redirect is revalidated and DNS cannot
 * substitute an internal address between URL validation and socket creation.
 * Note: outbound API cost/rate limiting is a separate deployment concern.
 */
async function fetchOne(url: URL): Promise<{ xml: string; redirect?: string }> {
  const addresses = await lookup(url.hostname, { family: 4, all: true });
  if (!addresses.length || addresses.some((record) => !isPublicRssIPv4(record.address)))
    throw new Error("Feed host did not resolve to a public IPv4 address.");
  const pinned = addresses[0]?.address;
  if (!pinned) throw new Error("Feed host is unavailable.");
  return new Promise((resolve, reject) => {
    const req = httpsRequest(url, {
      method: "GET",
      agent: false,
      // Node 20+ may ask lookup() for an address ARRAY when automatic family
      // selection is enabled. Only IPv4 was validated, so disable that mode
      // and preserve a single, already-vetted pinned destination.
      autoSelectFamily: false,
      lookup: (_host, _options, callback) => callback(null, pinned, 4),
      timeout: REQUEST_TIMEOUT_MS,
      headers: {
        "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*;q=0.1",
        "User-Agent": "NOEMA-RSS/0.1 (+https://noema-livid.vercel.app/)",
      },
    }, (response) => {
      const status = response.statusCode ?? 502;
      if ([301, 302, 303, 307, 308].includes(status)) {
        const target = response.headers.location;
        response.resume();
        if (!target) return reject(new Error("Feed redirect did not specify a destination."));
        return resolve({ xml: "", redirect: target });
      }
      if (status < 200 || status >= 300) {
        response.resume();
        return reject(new Error("Feed server returned HTTP " + status + "."));
      }
      const length = Number(response.headers["content-length"] ?? 0);
      if (length > MAX_RSS_BYTES) {
        response.destroy();
        return reject(new Error("Feed exceeds size limit."));
      }
      const chunks: Buffer[] = [];
      let total = 0;
      response.on("data", (chunk: Buffer) => {
        total += chunk.length;
        if (total > MAX_RSS_BYTES) {
          response.destroy();
          reject(new Error("Feed exceeds size limit."));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        const xml = Buffer.concat(chunks).toString("utf8");
        // Reject DTD/entity expansion rather than parsing potentially hostile XML.
        if (/<!(?:DOCTYPE|ENTITY)\b/i.test(xml)) return reject(new Error("Feed contains unsupported XML entities."));
        if (!/^\s*(?:\uFEFF\s*)?(?:<\?xml\b[^>]*>\s*)?(?:<!--[^]*?-->\s*)*<(?:rss\b|feed\b|rdf:RDF\b)/i.test(xml))
          return reject(new Error("Response was not an RSS or Atom XML feed."));
        resolve({ xml });
      });
      response.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error("Feed request timed out.")));
    req.on("error", reject);
    req.end();
  });
}

export async function getRssXml(input: string): Promise<string> {
  let next = safeRssSourceUrl(input);
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const { xml, redirect } = await fetchOne(next);
    if (!redirect) return xml;
    next = safeRssSourceUrl(new URL(redirect, next).toString());
  }
  throw new Error("Feed redirected too many times.");
}
