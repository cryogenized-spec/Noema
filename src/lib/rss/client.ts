import { db } from "@/lib/db/client";
import { parseRssXml } from "./parse";
import type { ParsedRssFeed, RssArticle, RssSubscription } from "@/types/rss";

export const MAX_RSS_SUBSCRIPTIONS = 35;
export const CACHE_LIMIT_PER_SOURCE = 80;
export const AUTO_REFRESH_MINUTES = 15;

/** RSS article identity is stable across refreshes without depending on
 * unreliable publishers' chronological order or browser-local integer IDs.
 */
async function articleId(subscriptionId: string, guid: string): Promise<string> {
  const encoded = new TextEncoder().encode(subscriptionId + "\u0000" + guid);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}
export async function loadRssSubscriptions(): Promise<RssSubscription[]> {
  return db.rssSubscriptions.orderBy("updatedAt").reverse().toArray();
}
export async function loadRssArticles(): Promise<RssArticle[]> {
  return db.rssArticles.toArray();
}
export async function saveRssArticles(subscription: RssSubscription, parsed: ParsedRssFeed): Promise<void> {
  const now = new Date().toISOString();
  const incoming = await Promise.all(parsed.articles.map(async (article) => ({
    ...article,
    id: await articleId(subscription.id, article.guid),
    subscriptionId: subscription.id,
    fetchedAt: now,
  })));
  await db.transaction("rw", db.rssArticles, db.rssSubscriptions, async () => {
    for (const article of incoming) {
      const existing = await db.rssArticles.get(article.id);
      await db.rssArticles.put({
        ...article,
        read: existing?.read ?? false,
        starred: existing?.starred ?? false,
      });
    }
    const articles = await db.rssArticles.where("subscriptionId").equals(subscription.id).toArray();
    // Retain starred stories even when old. Bound unstarred stories to keep
    // PWA memory and IndexedDB consumption predictable.
    const ordinary = articles.filter((article) => !article.starred)
      .sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt));
    await db.rssArticles.bulkDelete(ordinary.slice(CACHE_LIMIT_PER_SOURCE).map((entry) => entry.id));
    await db.rssSubscriptions.update(subscription.id, {
      lastFetchedAt: now,
      lastError: "",
      name: subscription.name.startsWith("Feed: ") && parsed.title ? parsed.title : subscription.name,
      updatedAt: now,
    });
  });
}
export async function getRssFeedXml(url: string, signal?: AbortSignal): Promise<string> {
  const reply = await fetch("/api/rss?url=" + encodeURIComponent(url), {
    method: "GET",
    signal,
  });
  if (!reply.ok) {
    const data = await reply.json().catch(() => null) as { error?: string } | null;
    throw new Error(data?.error || "Feed fetch failed (HTTP " + reply.status + ").");
  }
  return reply.text();
}
export async function refreshRssSubscription(subscription: RssSubscription, signal?: AbortSignal): Promise<void> {
  try {
    const xml = await getRssFeedXml(subscription.url, signal);
    const parsed = parseRssXml(xml, subscription.url);
    await saveRssArticles(subscription, parsed);
  } catch (error) {
    if (signal?.aborted) return;
    const message = error instanceof Error ? error.message : "Unable to refresh this feed.";
    await db.rssSubscriptions.update(subscription.id, { lastError: message.slice(0, 200), updatedAt: new Date().toISOString() });
    throw error;
  }
}
export async function updateRssArticleState(id: string, patch: Pick<Partial<RssArticle>, "read" | "starred">) {
  await db.rssArticles.update(id, patch);
}
export async function deleteRssSubscription(id: string): Promise<void> {
  await db.transaction("rw", db.rssSubscriptions, db.rssArticles, async () => {
    await db.rssArticles.where("subscriptionId").equals(id).delete();
    await db.rssSubscriptions.delete(id);
  });
}
