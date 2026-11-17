/** Live RSS/Atom channel data is a local browser subscription, never shared. */
export interface RssFolder {
  id: string;
  name: string;
  createdAt: string;
}
export interface RssSubscription {
  id: string;
  name: string;
  url: string;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
  lastFetchedAt?: string;
  lastError?: string;
}
export interface RssArticle {
  id: string;
  subscriptionId: string;
  guid: string;
  title: string;
  link: string;
  summary: string;
  publishedAt: string;
  fetchedAt: string;
  read: boolean;
  starred: boolean;
}
export interface ParsedRssFeed {
  title: string;
  articles: Array<Pick<RssArticle, "guid" | "title" | "link" | "summary" | "publishedAt">>;
}
