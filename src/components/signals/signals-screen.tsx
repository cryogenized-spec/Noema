"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { db } from "@/lib/db/client";
import {
  AUTO_REFRESH_MINUTES, MAX_RSS_SUBSCRIPTIONS,
  deleteRssSubscription, loadRssArticles, loadRssSubscriptions,
  refreshRssSubscription, updateRssArticleState,
} from "@/lib/rss/client";
import type { RssArticle, RssFolder, RssSubscription } from "@/types/rss";

type SignalsTab = "latest" | "saved" | "sources";
const CATALOG: ReadonlyArray<{ name: string; url: string }> = [
  { name: "Hacker News", url: "https://news.ycombinator.com/rss" },
  { name: "BBC Technology", url: "https://feeds.bbci.co.uk/news/technology/rss.xml" },
  { name: "NASA News", url: "https://www.nasa.gov/news-release/feed/" },
];
const inputClass = "min-w-0 w-full rounded-lg border border-noema-border bg-black px-3 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-noema-lime focus:outline-none";
const ghostButton = "min-h-10 rounded-lg border border-noema-border px-3 py-2 text-xs text-neutral-300 hover:border-noema-lime/60 disabled:opacity-40";
const accentButton = "min-h-10 rounded-lg bg-noema-lime px-3 py-2 text-xs font-semibold text-black disabled:opacity-40";

function displayTime(value: string | undefined): string {
  if (!value) return "Not fetched";
  const parsed = Date.parse(value);
  return Number.isFinite(parsed)
    ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(parsed))
    : "Unknown date";
}

export function SignalsScreen() {
  const [tab, setTab] = useState<SignalsTab>("latest");
  const [subscriptions, setSubscriptions] = useState<RssSubscription[]>([]);
  const [folders, setFolders] = useState<RssFolder[]>([]);
  const [articles, setArticles] = useState<RssArticle[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const [urlDraft, setUrlDraft] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [folderDraft, setFolderDraft] = useState("");
  const [newFolderId, setNewFolderId] = useState("");
  const [filterSourceId, setFilterSourceId] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [search, setSearch] = useState("");
  const refreshInFlight = useRef(false);
  const activeRef = useRef(true);

  const loadData = useCallback(async () => {
    const [feeds, groups, stories] = await Promise.all([
      loadRssSubscriptions(), db.rssFolders.orderBy("name").toArray(), loadRssArticles(),
    ]);
    if (activeRef.current) {
      setSubscriptions(feeds);
      setFolders(groups);
      setArticles(stories);
      setReady(true);
    }
    return feeds;
  }, []);

  const refreshMany = useCallback(async (feeds: RssSubscription[], force = false) => {
    if (refreshInFlight.current || feeds.length === 0) return;
    refreshInFlight.current = true;
    setError("");
    try {
      const now = Date.now();
      const waiting = feeds.filter((feed) => force || !feed.lastFetchedAt ||
        now - Date.parse(feed.lastFetchedAt) >= AUTO_REFRESH_MINUTES * 60_000);
      const failures: string[] = [];
      for (let i = 0; i < waiting.length; i += 3) {
        const batch = waiting.slice(i, i + 3);
        if (!activeRef.current) break;
        setBusyIds(batch.map((feed) => feed.id));
        const results = await Promise.allSettled(batch.map((feed) => refreshRssSubscription(feed)));
        results.forEach((result, index) => {
          if (result.status === "rejected") failures.push(batch[index]?.name || "Unknown source");
        });
        await loadData();
      }
      if (activeRef.current) {
        setStatus(waiting.length ? "Updated " + (waiting.length - failures.length) + " of " + waiting.length + " sources."
          : "Your cached articles are up to date.");
        if (failures.length) setError("Some sources failed: " + failures.slice(0, 4).join(", ") + (failures.length > 4 ? "…" : ""));
      }
    } finally {
      refreshInFlight.current = false;
      if (activeRef.current) setBusyIds([]);
    }
  }, [loadData]);

  useEffect(() => {
    activeRef.current = true;
    void loadData().then((feeds) => void refreshMany(feeds)).catch(() => {
      if (activeRef.current) { setError("Local feed storage could not be opened."); setReady(true); }
    });
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void loadData().then((feeds) => void refreshMany(feeds)).catch(() => {});
      }
    };
    const interval = window.setInterval(onVisible, AUTO_REFRESH_MINUTES * 60_000);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      activeRef.current = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loadData, refreshMany]);

  const addFeed = async (sourceUrl?: string, suggestedName?: string) => {
    const input = (sourceUrl ?? urlDraft).trim();
    let parsed: URL;
    try {
      parsed = new URL(input);
      if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password)
        throw Error();
    } catch { setError("Enter a valid HTTPS RSS/Atom address."); return; }
    parsed.hash = "";
    const url = parsed.toString();
    if (subscriptions.some((entry) => entry.url === url)) {
      setError("That source is already subscribed."); return;
    }
    if (subscriptions.length >= MAX_RSS_SUBSCRIPTIONS) {
      setError("For performance, NOEMA currently supports " + MAX_RSS_SUBSCRIPTIONS + " sources per browser."); return;
    }
    const now = new Date().toISOString();
    const next: RssSubscription = {
      id: crypto.randomUUID(),
      name: (suggestedName || nameDraft.trim() || "Feed: " + parsed.hostname).slice(0, 100),
      url,
      folderId: newFolderId || null,
      createdAt: now, updatedAt: now,
    };
    try {
      await db.rssSubscriptions.add(next);
      setUrlDraft(""); setNameDraft(""); setError("");
      setStatus("Added " + next.name + ". Fetching articles…");
      await loadData();
      setBusyIds([next.id]);
      try {
        await refreshRssSubscription(next);
        setStatus(next.name + " is now live.");
      } catch (reason) {
        setError(next.name + " was saved but could not refresh: " +
          (reason instanceof Error ? reason.message : "Network error"));
      } finally {
        await loadData();
        setBusyIds([]);
      }
    } catch { setError("Unable to save this source. Check storage or duplicates."); }
  };

  const refreshOne = async (feed: RssSubscription) => {
    setError("");
    setBusyIds([feed.id]);
    try {
      await refreshRssSubscription(feed);
      setStatus(feed.name + " updated.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not fetch " + feed.name);
    } finally { await loadData(); setBusyIds([]); }
  };

  const removeFeed = async (feed: RssSubscription) => {
    if (!window.confirm("Remove " + feed.name + " and its locally cached articles?")) return;
    try {
      await deleteRssSubscription(feed.id);
      if (filterSourceId === feed.id) setFilterSourceId("");
      await loadData();
      setStatus("Feed removed.");
    } catch { setError("Could not remove this source."); }
  };

  const addFolder = async () => {
    const name = folderDraft.trim().slice(0, 55);
    if (!name) return;
    try {
      await db.rssFolders.add({ id: crypto.randomUUID(), name, createdAt: new Date().toISOString() });
      setFolderDraft(""); await loadData();
      setStatus("Folder added.");
    } catch { setError("Could not add the folder."); }
  };
  const removeFolder = async (folder: RssFolder) => {
    if (!window.confirm("Remove folder " + folder.name + "? Its feeds will remain subscribed.")) return;
    await db.transaction("rw", db.rssFolders, db.rssSubscriptions, async () => {
      await db.rssSubscriptions.where("folderId").equals(folder.id).modify({ folderId: null });
      await db.rssFolders.delete(folder.id);
    });
    if (newFolderId === folder.id) setNewFolderId("");
    await loadData();
  };

  const toggleArticle = async (article: RssArticle, state: "read" | "starred") => {
    await updateRssArticleState(article.id, { [state]: !article[state] });
    setArticles((previous) => previous.map((entry) =>
      entry.id === article.id ? { ...entry, [state]: !article[state] } : entry));
  };

  const entries = useMemo(() => {
    const query = search.trim().toLowerCase();
    return articles
      .filter((entry) => tab !== "saved" || entry.starred)
      .filter((entry) => !filterSourceId || entry.subscriptionId === filterSourceId)
      .filter((entry) => tab !== "latest" || !unreadOnly || !entry.read)
      .filter((entry) => !query || (entry.title + " " + entry.summary).toLowerCase().includes(query))
      .sort((a, b) => (b.publishedAt || b.fetchedAt).localeCompare(a.publishedAt || a.fetchedAt))
      .slice(0, 180);
  }, [articles, tab, filterSourceId, unreadOnly, search]);
  const sourceNames = useMemo(() => new Map(subscriptions.map((feed) => [feed.id, feed.name])), [subscriptions]);
  const unreadCount = articles.filter((entry) => !entry.read).length;
  const badge = "rounded-lg border border-noema-border bg-black/30 px-2 py-1 text-[10px] text-neutral-400";

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col gap-2 overflow-hidden rounded-xl border border-noema-border bg-[#0b0b0d] p-2 sm:p-3">
      <header className="flex shrink-0 items-center justify-between gap-2 px-1">
        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-white">Signals <span className="ml-1 text-[11px] font-normal text-neutral-500">/ RSS + Atom</span></h1>
          <p className="text-[11px] text-neutral-500">{subscriptions.length} sources · {unreadCount} unread · saved locally</p>
        </div>
        <button type="button" disabled={!ready || busyIds.length > 0}
          onClick={() => void refreshMany(subscriptions, true)}
          className={ghostButton + " flex shrink-0 items-center gap-1"}>
          <Icon icon="solar:refresh-linear" className={busyIds.length ? "animate-spin" : ""} aria-hidden="true" /> Refresh
        </button>
      </header>
      <nav className="grid shrink-0 grid-cols-3 gap-1 rounded-lg border border-noema-border bg-[#111113] p-1" aria-label="Signals sections">
        {([["latest", "Articles"], ["saved", "Saved"], ["sources", "Sources"]] as const).map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTab(key)} aria-current={tab === key ? "page" : undefined}
            className={"min-h-10 rounded-md text-xs font-semibold transition " +
              (tab === key ? "bg-noema-lime text-black" : "text-neutral-400 hover:bg-white/[0.06] hover:text-white")}>
            {label}
          </button>
        ))}
      </nav>
      {(error || status) && (
        <div className="shrink-0 space-y-1" role="status">
          {error && <p className="rounded-md border border-rose-500/20 bg-rose-950/20 px-2 py-1.5 text-[11px] text-rose-200">{error}</p>}
          {status && <p className="px-2 text-[11px] text-neutral-400">{status}</p>}
        </div>
      )}
      {tab !== "sources" && (
        <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
          <input aria-label="Search articles" placeholder="Search articles…" value={search} onChange={(e) => setSearch(e.target.value)}
            className={inputClass} />
          <select aria-label="Filter source" value={filterSourceId} onChange={(e) => setFilterSourceId(e.target.value)}
            className={inputClass}>
            <option value="">All sources</option>
            {subscriptions.map((feed) => <option key={feed.id} value={feed.id}>{feed.name}</option>)}
          </select>
        </div>
      )}
      <div className="min-h-0 min-w-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pb-2">
        {!ready && <p className="p-5 text-sm text-neutral-400">Opening local feed library…</p>}
        {ready && tab !== "sources" && (
          <>
            {tab === "latest" && <label className="flex items-center gap-2 px-2 py-1 text-[11px] text-neutral-400">
              <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
              Unread only
              <span className="ml-auto text-neutral-600">{entries.length} articles</span>
            </label>}
            {entries.length === 0 && <div className="rounded-lg border border-dashed border-noema-border p-5 text-center text-sm text-neutral-400">
              {subscriptions.length ? "No matching articles in the local cache." : "No RSS subscriptions yet. Open Sources to add your first live feed."}
              {subscriptions.length === 0 && <button type="button" onClick={() => setTab("sources")}
                className={accentButton + " mt-4 block w-full"}>Add a feed</button>}
            </div>}
            {entries.map((article) => (
              <article key={article.id} className={"min-w-0 rounded-lg border p-3 " +
                (article.read ? "border-noema-border bg-[#101012]" : "border-noema-borderSoft bg-[#171719]")}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-[10px] font-medium text-noema-violet">
                    {sourceNames.get(article.subscriptionId) || "Feed"}
                  </span>
                  <span className="shrink-0 text-[10px] text-neutral-500">{displayTime(article.publishedAt || article.fetchedAt)}</span>
                </div>
                {article.link ? (
                  <a href={article.link} target="_blank" rel="noopener noreferrer"
                    onClick={() => { if (!article.read) void toggleArticle(article, "read"); }}
                    className="block break-words text-sm font-semibold leading-5 text-white hover:text-noema-lime">
                    {article.title} <Icon icon="solar:arrow-right-up-linear" className="inline text-xs" aria-hidden="true" />
                  </a>
                ) : <p className="break-words text-sm font-semibold text-neutral-200">{article.title}</p>}
                {article.summary && <p className="mt-2 line-clamp-3 break-words text-xs leading-5 text-neutral-400">{article.summary}</p>}
                <div className="mt-2 flex items-center justify-between gap-2 border-t border-noema-border/70 pt-2">
                  <button type="button" onClick={() => void toggleArticle(article, "read")}
                    aria-label={article.read ? "Mark article unread" : "Mark article read"} className="min-h-8 px-2 text-[11px] text-neutral-400 hover:text-white">
                    <Icon icon={article.read ? "solar:letter-unread-linear" : "solar:check-read-linear"} className="mr-1 inline" aria-hidden="true" />
                    {article.read ? "Unread" : "Mark read"}
                  </button>
                  <button type="button" onClick={() => void toggleArticle(article, "starred")}
                    aria-pressed={article.starred} aria-label={article.starred ? "Remove saved article" : "Save article"}
                    className={"min-h-8 px-2 text-[11px] " + (article.starred ? "text-noema-gold" : "text-neutral-400 hover:text-white")}>
                    <Icon icon={article.starred ? "solar:star-bold" : "solar:star-linear"} className="mr-1 inline" aria-hidden="true" />
                    {article.starred ? "Saved" : "Save"}
                  </button>
                </div>
              </article>
            ))}
          </>
        )}
        {ready && tab === "sources" && (
          <div className="space-y-3">
            <section className="space-y-2 rounded-lg border border-noema-border bg-[#111113] p-3">
              <h2 className="text-xs font-semibold text-noema-lime">Add RSS or Atom feed</h2>
              <input type="url" placeholder="https://example.com/feed.xml" aria-label="Feed URL"
                value={urlDraft} onChange={(e) => setUrlDraft(e.target.value)} className={inputClass} />
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
                <input placeholder="Name (optional)" aria-label="Feed name" maxLength={100}
                  value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} className={inputClass} />
                <select aria-label="Feed folder" className={inputClass} value={newFolderId} onChange={(e) => setNewFolderId(e.target.value)}>
                  <option value="">Unfiled</option>
                  {folders.map((folder) => <option value={folder.id} key={folder.id}>{folder.name}</option>)}
                </select>
              </div>
              <button type="button" className={accentButton + " w-full"}
                onClick={() => void addFeed()} disabled={!urlDraft.trim() || busyIds.length > 0}>
                <Icon icon="solar:add-circle-linear" className="mr-1 inline" aria-hidden="true" /> Subscribe & fetch
              </button>
              <p className="text-[11px] leading-4 text-neutral-500">
                HTTPS feeds only. Some sites block feed readers or provide no public RSS.
                Social-media bridges are not emulated; no fictitious articles are generated. Avoid feed URLs containing private access tokens.
              </p>
            </section>
            <section className="space-y-2 rounded-lg border border-noema-border bg-[#111113] p-3">
              <h2 className="text-xs font-semibold text-neutral-300">Try a public feed</h2>
              <div className="flex flex-wrap gap-2">
                {CATALOG.map((source) => <button type="button" key={source.url}
                  disabled={busyIds.length > 0 || subscriptions.some((feed) => feed.url === source.url)}
                  className={ghostButton} onClick={() => void addFeed(source.url, source.name)}>
                  <Icon icon="solar:rss-linear" className="mr-1 inline" aria-hidden="true" /> {source.name}
                </button>)}
              </div>
            </section>
            <section className="space-y-2 rounded-lg border border-noema-border bg-[#111113] p-3">
              <h2 className="text-xs font-semibold text-neutral-300">Folders</h2>
              <div className="flex gap-2">
                <input placeholder="New folder" value={folderDraft} maxLength={55} aria-label="New folder"
                  onChange={(e) => setFolderDraft(e.target.value)} className={inputClass} />
                <button type="button" className={ghostButton} onClick={() => void addFolder()} disabled={!folderDraft.trim()}>Add</button>
              </div>
              {folders.length > 0 && <div className="flex flex-wrap gap-2">
                {folders.map((folder) => <span key={folder.id} className={badge}>
                  <Icon icon="solar:folder-linear" className="mr-1 inline" aria-hidden="true" /> {folder.name}
                  <button type="button" onClick={() => void removeFolder(folder)} aria-label={"Delete folder " + folder.name}
                    className="ml-2 text-rose-300 hover:text-rose-200">×</button>
                </span>)}
              </div>}
            </section>
            <section className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-xs font-semibold text-neutral-200">Your sources</h2>
                <span className="text-[10px] text-neutral-500">{subscriptions.length} / {MAX_RSS_SUBSCRIPTIONS}</span>
              </div>
              {subscriptions.length === 0 && <p className="p-3 text-xs text-neutral-500">Subscribe to an RSS URL to begin.</p>}
              {subscriptions.map((feed) => (
                <div key={feed.id} className="space-y-2 rounded-lg border border-noema-border bg-[#111113] p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-white">{feed.name}</p>
                      <p className="truncate text-[11px] text-neutral-500" title={feed.url}>{feed.url}</p>
                      <p className="mt-1 text-[10px] text-neutral-500">Last checked: {displayTime(feed.lastFetchedAt)}</p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button type="button" aria-label={"Refresh " + feed.name} disabled={busyIds.length > 0}
                        onClick={() => void refreshOne(feed)} className="rounded-md border border-noema-border p-2 text-neutral-300 hover:text-noema-lime">
                        <Icon icon="solar:refresh-linear" className={busyIds.includes(feed.id) ? "animate-spin" : ""} aria-hidden="true" />
                      </button>
                      <button type="button" aria-label={"Remove " + feed.name} onClick={() => void removeFeed(feed)}
                        className="rounded-md border border-noema-border p-2 text-rose-300 hover:text-rose-200">
                        <Icon icon="solar:trash-bin-trash-linear" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  {feed.lastError && <p className="rounded bg-rose-950/20 p-2 text-[11px] text-rose-300">{feed.lastError}</p>}
                  <select aria-label={"Folder for " + feed.name} className={inputClass}
                    value={feed.folderId || ""} onChange={async (e) => {
                      await db.rssSubscriptions.update(feed.id, { folderId: e.target.value || null });
                      await loadData();
                    }}>
                    <option value="">Unfiled</option>
                    {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
                  </select>
                </div>
              ))}
            </section>
          </div>
        )}
      </div>
      <footer className="shrink-0 border-t border-noema-border px-2 pt-2 text-[10px] leading-4 text-neutral-500">
        Headlines and excerpts are cached for offline viewing; full articles open on publisher sites. No AI analysis or analytics is active.
      </footer>
    </section>
  );
}
