"use client";

import { getOrCreateDeviceIdentity, signDeviceChallenge } from "@/lib/security/device-identity";

export interface RelaySession {
  token: string;
  deviceId: string;
  expiresAt: string;
}
export interface RelayThread {
  id: string;
  owner: string;
  guest: string;
  keyId: string;
  ownerAlias: string;
  guestAlias: string;
  receptionEnabled: boolean;
  receptionEnabledFromSeq: number;
  nextSeq: number;
  updatedAt: string;
}
export interface RelayMessage {
  id: string;
  seq: number;
  clientMessageId: string;
  content: string;
  sender: "owner" | "guest" | "agent";
  createdAt: string;
  status: "stored";
}
const SESSION_KEY = "noema-relay-auth-v1";
export const relayOrigin = (process.env.NEXT_PUBLIC_NOEMA_RELAY_URL || "").replace(/\/$/, "");
export const relayAvailable = /^https:\/\//.test(relayOrigin) ||
  /^http:\/\/localhost(?::\d+)?$/.test(relayOrigin);

export class RelayError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) { super(message); }
}
export async function relayFetch<T>(path: string, options: {
  session?: RelaySession; body?: unknown; method?: "GET" | "POST"; signal?: AbortSignal;
} = {}): Promise<T> {
  if (!relayAvailable) throw new RelayError("Relay is not configured.", 503);
  const response = await fetch(relayOrigin + path, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.session ? { Authorization: "Bearer " + options.session.token } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
    signal: options.signal,
  });
  let result: unknown;
  try { result = await response.json(); } catch { throw new RelayError("Relay returned an invalid response.", response.status); }
  if (!response.ok) {
    const error = result && typeof result === "object" && "error" in result ? String(result.error) : "Relay request failed.";
    const code = result && typeof result === "object" && "code" in result ? String(result.code) : undefined;
    throw new RelayError(error, response.status, code);
  }
  return result as T;
}
/** Read a previously authenticated session without issuing network requests
 * or signing a challenge. Safe for lightweight UI indicators and foreground polls.
 */
export function readCachedRelaySession(): RelaySession | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as RelaySession;
    if (typeof parsed?.token !== "string" || typeof parsed?.deviceId !== "string" ||
        !/^[A-Za-z0-9_-]{40,90}$/.test(parsed.token) ||
        new Date(parsed.expiresAt).getTime() - Date.now() <= 60000) return null;
    return parsed;
  } catch { return null; }
}
export async function ensureRelaySession(force = false): Promise<RelaySession> {
  if (!force) {
    const saved = readCachedRelaySession();
    if (saved) return saved;
  }
  const identity = await getOrCreateDeviceIdentity();
  const step1 = await relayFetch<{ challenge:string }>("/v1/auth/challenge", {
    method:"POST", body:{ deviceId:identity.deviceId, publicJwk:identity.publicJwk },
  });
  const signed = await signDeviceChallenge(step1.challenge, relayOrigin);
  const session = await relayFetch<RelaySession>("/v1/auth/verify", {
    method:"POST", body:signed,
  });
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); }
  catch { /* Session works for current component lifetime. */ }
  // The global notification is mounted before Contact authentication completes.
  // Inform it immediately without exposing the signed token in the event.
  if (typeof window !== "undefined") window.dispatchEvent(new Event("noema:relay-session"));
  return session;
}
export const relayGetThreads = (session: RelaySession) =>
  relayFetch<{ threads:RelayThread[] }>("/v1/threads", {session});
export interface RelayMessagePage {
  messages:RelayMessage[]; nextSeq:number; hasMore:boolean;
}
export const relayGetMessages = (session:RelaySession, id:string, after = 0) =>
  relayFetch<RelayMessagePage>(
    "/v1/threads/" + encodeURIComponent(id) + "/messages?after=" + after, {session});
export const relayGetOlderMessages = (session:RelaySession,id:string,before:number) =>
  relayFetch<RelayMessagePage>(
    "/v1/threads/" + encodeURIComponent(id) + "/messages?before=" + encodeURIComponent(String(before)), {session});
export interface ReceptionPolicy {
  enabled:boolean; enabledAt:number; maxDailyCalls:number; maxThreadCalls:number;
}
export const relayGetIdentity = (session:RelaySession)=>
  relayFetch<{deviceId:string;owner:boolean}>("/v1/identity",{session});
export const relayGetPolicy = (session:RelaySession)=>
  relayFetch<{policy:ReceptionPolicy}>("/v1/reception/policy",{session});
export const relaySetPolicy = (session:RelaySession,policy:Pick<ReceptionPolicy,
  "enabled"|"maxDailyCalls"|"maxThreadCalls">)=>
  relayFetch<{policy:ReceptionPolicy}>("/v1/reception/policy",{session,method:"POST",body:policy});
export const relaySetThreadReception = (session:RelaySession,id:string,enabled:boolean)=>
  relayFetch<{thread:RelayThread}>("/v1/threads/"+encodeURIComponent(id)+"/reception",
    {session,method:"POST",body:{enabled}});
export const relayPostMessage = (session:RelaySession, id:string, content:string,
  clientMessageId:string, asAgent = false, claim?:{sourceSeq:number;claimToken:string}) =>
  relayFetch<{message:RelayMessage}>(
    "/v1/threads/" + encodeURIComponent(id) + "/messages",
    {session, method:"POST", body:{content,clientMessageId,asAgent,...claim}});
