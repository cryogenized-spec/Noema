import type { ParsedRssFeed } from "@/types/rss";

const trimmed = (value: string | null | undefined, max: number) =>
  (value ?? "").trim().replace(/\s+/g, " ").slice(0, max);

function child(node: Element, ...names: string[]): Element | undefined {
  return Array.from(node.children).find((entry) => names.includes(entry.localName.toLowerCase()));
}
function value(node: Element, ...names: string[]): string {
  return child(node, ...names)?.textContent?.trim() ?? "";
}
export function safeRssArticleUrl(raw: string, base: string): string {
  try {
    const url = new URL(raw.trim(), base);
    return url.protocol === "https:" ? url.toString() : "";
  } catch { return ""; }
}
function textFromHtml(raw: string): string {
  const html = new DOMParser().parseFromString(raw, "text/html");
  for (const el of html.querySelectorAll("script,style,iframe,object,embed,svg")) el.remove();
  return trimmed(html.body.textContent, 380);
}

/** DOMParser creates an inert XML document and React outputs only text;
 * never insert source HTML or SVG into the live DOM.
 */
export function parseRssXml(xml: string, feedUrl: string): ParsedRssFeed {
  if (xml.length > 950_000 || /<!(?:DOCTYPE|ENTITY)\b/i.test(xml))
    throw new Error("This feed is too large or contains unsupported entities.");
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("This source returned invalid XML.");
  const root = doc.documentElement;
  if (!root || !["rss", "feed", "rdf"].includes(root.localName.toLowerCase()))
    throw new Error("This page does not contain an RSS or Atom feed.");
  const atom = root.localName.toLowerCase() === "feed";
  const channel = atom ? root : child(root, "channel") ?? root;
  const title = trimmed(value(channel, "title"), 100) || new URL(feedUrl).hostname;
  const articles = Array.from(atom ? root.children : channel.children)
    .filter((entry) => atom ? entry.localName === "entry" : entry.localName === "item")
    .slice(0, 35).map((entry) => {
      const headline = trimmed(value(entry, "title"), 240) || "Untitled";
      const directLink = child(entry, "link");
      const alternateLink = Array.from(entry.children).find((part) =>
        part.localName === "link" && (!part.getAttribute("rel") || part.getAttribute("rel") === "alternate"));
      const href = atom ? (alternateLink?.getAttribute("href") || directLink?.getAttribute("href") || "")
        : (directLink?.textContent ?? "");
      const link = safeRssArticleUrl(href, feedUrl);
      const guid = trimmed(value(entry, "guid", "id"), 600) || link || headline;
      const published = value(entry, "pubdate", "published", "updated", "date");
      const time = Date.parse(published);
      const rawSummary = value(entry, "description", "summary", "encoded", "content");
      return {
        guid,
        title: headline,
        link,
        summary: textFromHtml(rawSummary),
        publishedAt: Number.isFinite(time) ? new Date(time).toISOString() : "",
      };
    });
  return { title, articles };
}
