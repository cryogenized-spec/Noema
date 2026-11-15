"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLockboxStore } from "@/store/lockbox-store";
import { readOpenAIStream } from "@/lib/ai/openai-sse";
import {
  ensureRelaySession, relayAvailable, relayOrigin, relayFetch,
  relayGetMessages, relayGetThreads, relayPostMessage, RelayError,
  type RelayMessage, type RelaySession, type RelayThread,
} from "@/lib/network/relay-client";

const PERSONAS = ["Quiet Finch", "Moss Lantern", "Silver Circuit", "Amber Orchard", "Violet Atlas"];
const newClientId = () => "message-" + crypto.randomUUID().replace(/-/g, "");
const prettyError = (e: unknown) => e instanceof Error ? e.message : "Unknown connection error.";

export function RelayWorkspace({ inviteToken }: { inviteToken?: string }) {
  const [session, setSession] = useState<RelaySession | null>(null);
  const [threads, setThreads] = useState<RelayThread[]>([]);
  const [activeId, setActiveId] = useState("");
  const [messages, setMessages] = useState<RelayMessage[]>([]);
  const [alias, setAlias] = useState("");
  const [drafts, setDrafts] = useState<Record<string,string>>({});
  const draft = drafts[activeId] ?? "";
  // Retry uncertain network sends with the ORIGINAL ID, scoped to thread and text.
  const uncertainSends = useRef(new Map<string,{content:string;messageId:string}>());
  const [agentWarning, setAgentWarning] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [connected, setConnected] = useState(false);
  const [workingAgent, setWorkingAgent] = useState(false);
  const [inviteConsumed, setInviteConsumed] = useState(false);
  const { unlocked, revealKey, records, hydrate } = useLockboxStore();
  const activeIdRef = useRef("");
  const runningRef = useRef(false);
  const agentRunning = useRef(false);
  const handled = useRef(new Set<string>());
  const stopped = useRef(false);
  const agentController = useRef<AbortController | null>(null);
  const activeAgentThread = useRef<string | null>(null);
  const lastRenewAttempt = useRef(0);
  const agentRetryAfter = useRef(0);
  useEffect(() => {
    agentRetryAfter.current = 0;
    setAgentWarning("");
  }, [unlocked, records]);

  useEffect(() => { hydrate(); }, [hydrate]);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);
  useEffect(() => {
    if (!relayAvailable) return;
    stopped.current = false;
    void ensureRelaySession().then((value) => {
      if (!stopped.current) { setSession(value); setConnected(true); }
    }).catch((e:unknown) => { if (!stopped.current) setError(prettyError(e)); });
    return () => { stopped.current = true; agentController.current?.abort(); };
  }, []);

  const refresh = useCallback(async () => {
    if (!session || runningRef.current || (inviteToken && !inviteConsumed)) return;
    runningRef.current = true;
    const renew = async () => {
      if (Date.now() - lastRenewAttempt.current < 30000) {
        throw new Error("Relay session renewal is temporarily unavailable.");
      }
      lastRenewAttempt.current = Date.now();
      const next = await ensureRelaySession(true);
      if (!stopped.current) setSession(next);
    };
    try {
      // Renewal does not depend on which thread is visible.
      if (new Date(session.expiresAt).getTime() - Date.now() < 120000) {
        await renew();
        return;
      }
      const inbox = await relayGetThreads(session);
      if (stopped.current) return;
      setThreads(inbox.threads);
      const selectedId = activeIdRef.current;
      if (selectedId && inbox.threads.some((thread) => thread.id === selectedId)) {
        const response = await relayGetMessages(session, selectedId);
        // A previous selected thread's delayed response must not repaint the new one.
        if (!stopped.current && activeIdRef.current === selectedId)
          setMessages(response.messages);
      }

      // One global authenticated query covers every ON owner thread.
      // The active conversation is a display choice, not a reception filter.
      if (!agentRunning.current && unlocked &&
          records.some((record) => record.providerId === "openai") &&
          Date.now() >= agentRetryAfter.current) {
        const pending = await relayFetch<{pending:Array<{threadId:string; message:RelayMessage}>}>(
          "/v1/reception/pending", {session},
        );
        const item = pending.pending.find((entry) => !handled.current.has(entry.message.id));
        if (item) {
          const id = item.threadId, next = item.message;
          agentRunning.current = true;
          setWorkingAgent(true);
          const controller = new AbortController();
          agentController.current = controller;
          activeAgentThread.current = id;
          try {
            // Unlock before taking a paid-request lease so failed unlocks cost nothing.
            const apiKey = await revealKey("openai");
            const model = records.find((record) => record.providerId === "openai")?.defaultModelId || "gpt-4.1-mini";
            const claim = await relayFetch<{claimToken:string}>(
              "/v1/threads/" + id + "/agent-claim", {
                session, method:"POST", body:{seq:next.seq}, signal:controller.signal,
              },
            );
            handled.current.add(next.id);
            const upstream = await fetch(relayOrigin + "/v1/threads/" + id + "/agent-response", {
              method:"POST", signal:controller.signal,
              headers:{ Authorization:"Bearer " + session.token, "Content-Type":"application/json" },
              body:JSON.stringify({ seq:next.seq, claimToken:claim.claimToken, apiKey, model }),
              cache:"no-store",
            });
            if (!upstream.ok || !upstream.body) throw Error("Reception provider unavailable.");
            const reply = await readOpenAIStream(upstream.body, async () => {});
            if (controller.signal.aborted || stopped.current) return;
            await relayPostMessage(session, id, reply.slice(0, 4000),
              "agent-response-" + String(next.seq).padStart(12,"0"), true);
            if (activeIdRef.current === id) {
              const after = await relayGetMessages(session, id);
              if (!stopped.current && activeIdRef.current === id)
                setMessages(after.messages);
            }
          } catch (error:unknown) {
            if (!controller.signal.aborted && !stopped.current) {
              if (error instanceof RelayError && error.code === "AGENT_BUDGET_EXHAUSTED") {
                // Server budgets use UTC calendar days.
                const midnight = new Date();
                midnight.setUTCHours(24,0,0,0);
                agentRetryAfter.current = midnight.getTime();
                setAgentWarning("AI reception paused until the daily usage budget resets.");
              } else if (error instanceof RelayError && error.code === "CLAIM_UNAVAILABLE") {
                agentRetryAfter.current = Date.now() + 30000;
              } else {
                // Do not repeatedly hammer the provider or vault at 4-second intervals.
                agentRetryAfter.current = Date.now() + 60000;
                setAgentWarning("AI reception encountered an error and is pausing retries. You can reply manually.");
                setError(prettyError(error));
              }
            }
          } finally {
            agentRunning.current = false;
            agentController.current = null;
            activeAgentThread.current = null;
            if (!stopped.current) setWorkingAgent(false);
          }
        }
      }
    } catch (error:unknown) {
      if (!stopped.current) {
        if (error instanceof RelayError && error.status === 401) {
          try { await renew(); } catch (renewError:unknown) { setError(prettyError(renewError)); }
        } else {
          setError(prettyError(error));
        }
      }
    } finally { runningRef.current = false; }
  }, [session, unlocked, revealKey, records, inviteToken, inviteConsumed]);

  useEffect(() => {
    if (!session || (inviteToken && !inviteConsumed)) return;
    void refresh();
    const timer = window.setInterval(() => void refresh(), 4000);
    return () => window.clearInterval(timer);
  }, [session, refresh, inviteToken, inviteConsumed]);

  const activeThread = threads.find((t) => t.id === activeId);
  const isOwner = !!session && activeThread?.owner === session.deviceId;

  const run = async (task: () => Promise<void>) => {
    if (pending) return;
    setPending(true); setError(""); setNotice("");
    try { await task(); } catch (e:unknown) { setError(prettyError(e)); }
    finally { setPending(false); }
  };
  const randomName = () => setAlias(PERSONAS[crypto.getRandomValues(new Uint32Array(1))[0] % PERSONAS.length]);
  const createInvite = () => run(async () => {
    if (!session) throw Error("Device has not signed in.");
    const reply = await relayFetch<{token:string;expiresAt:string}>("/v1/invites", {
      session, method:"POST", body:{alias:alias || "NOEMA Contact"},
    });
    setInviteUrl(window.location.origin + "/invite/" + encodeURIComponent(reply.token));
    setNotice("A private, single-use invitation was created. Only share it with your intended guest.");
  });
  const joinInvite = () => run(async () => {
    if (!session || !inviteToken) throw Error("Invalid invitation.");
    const response = await relayFetch<{thread:RelayThread}>("/v1/invites/redeem", {
      session, method:"POST", body:{token:inviteToken,alias:alias || "Quiet Finch"},
    });
    setActiveId(response.thread.id);
    activeIdRef.current = response.thread.id;
    setThreads((previous) => [response.thread, ...previous]);
    setNotice("Connected. Nothing was sent to the recipient yet.");
    setInviteConsumed(true);
    // Immediately scrub the one-use secret from the address bar.
    window.history.replaceState(null, "", "/connect");
    // The normal polling effect begins after inviteConsumed has been set.
  });
  const send = () => run(async () => {
    if (!session || !activeId || !draft.trim()) return;
    const id = activeId;
    const text = draft.trim();
    const last = uncertainSends.current.get(id);
    const messageId = last?.content === text ? last.messageId : newClientId();
    uncertainSends.current.set(id,{content:text,messageId});
    await relayPostMessage(session,id,text,messageId);
    uncertainSends.current.delete(id);
    setDrafts((current) => current[id]?.trim() === text ? {...current,[id]:""} : current);
    const reply = await relayGetMessages(session,id);
    if (activeIdRef.current === id) setMessages(reply.messages);
  });
  const toggleReception = () => run(async () => {
    if (!session || !activeThread || !isOwner) return;
    const enabled = !activeThread.receptionEnabled;
    if (enabled && !unlocked) throw Error("Unlock the OpenAI API Lockbox in Settings first. Leave this browser open.");
    if (!enabled && activeAgentThread.current === activeId) agentController.current?.abort();
    await relayFetch("/v1/threads/" + activeId + "/reception", {
      session, method:"POST", body:{enabled},
    });
    setThreads((current) => current.map((t) => t.id === activeId ? {...t,receptionEnabled:enabled}:t));
    agentRetryAfter.current = 0;
    setAgentWarning("");
    setNotice(enabled ? "AI reception ON while this unlocked browser tab is open." : "AI reception OFF.");
  });

  const button = "rounded-lg border border-noema-border bg-[#1a1a1d] px-3 py-2 text-xs font-medium text-white hover:border-noema-lime/50 disabled:opacity-40";
  const field = "w-full rounded-lg border border-noema-border bg-black px-3 py-3 text-sm text-white focus:border-noema-lime focus:outline-none";
  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-5 px-4 pb-10 pt-6 text-white sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-noema-border pb-4">
        <Link href="/" className="text-base font-semibold tracking-[0.16em]">NOEMA<span className="text-noema-lime">.</span></Link>
        <span className="text-xs text-noema-muted">PRIVATE RELAY PILOT · NOT END-TO-END ENCRYPTED</span>
        <Link href="/" className={button}>Workspace</Link>
      </header>
      {!relayAvailable && <section className="rounded-xl border border-noema-burgundy p-5 text-sm">
        Relay not configured. Deploy your own Cloudflare relay and set NEXT_PUBLIC_NOEMA_RELAY_URL.
        No public messaging service is active here.
      </section>}
      {relayAvailable && <div className="text-xs text-neutral-400">
        {connected ? "Device authenticated · " + session?.deviceId.slice(0, 14) + "…" : "Signing in with your device key…"}
      </div>}
      {error && <p role="alert" className="rounded-md border border-rose-700/60 bg-rose-950/40 p-3 text-sm text-rose-200">{error}</p>}
      {agentWarning && <p role="status" className="rounded-md border border-amber-700/60 bg-amber-950/25 p-3 text-xs text-amber-200">{agentWarning}</p>}
      {notice && <p role="status" className="rounded-md border border-noema-lime/30 p-3 text-sm text-noema-lime">{notice}</p>}
      <section className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-4 rounded-xl border border-noema-border bg-[#111113] p-4">
          {inviteToken && !inviteConsumed ? (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Accept invitation</h2>
              <p className="text-xs text-neutral-400">Choose an alias, then deliberately connect. Opening this link never sends a message or wakes an agent.</p>
              <input value={alias} maxLength={32} onChange={(event) => setAlias(event.target.value)}
                placeholder="Display name (optional)" className={field} />
              <button type="button" onClick={randomName} className={button}>Random persona</button>
              <button type="button" disabled={!session || pending} onClick={() => void joinInvite()}
                className="block w-full rounded-lg bg-noema-lime px-3 py-3 text-sm font-semibold text-black disabled:opacity-40">
                Continue anonymously
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Invite someone</h2>
              <p className="text-xs text-neutral-400">No phone number required. Share a private, 24-hour, single-use link using WhatsApp or any other channel.</p>
              <input value={alias} maxLength={32} onChange={(event) => setAlias(event.target.value)}
                placeholder="Your display name" className={field} />
              <button type="button" disabled={!session || pending} onClick={() => void createInvite()}
                className="block w-full rounded-lg bg-noema-lime px-3 py-3 text-sm font-semibold text-black disabled:opacity-40">
                Create invitation
              </button>
              {inviteUrl && <div className="space-y-2">
                <p className="break-all rounded-lg border border-noema-border p-2 text-xs text-neutral-300">{inviteUrl}</p>
                <button type="button" className={button} onClick={() => void navigator.clipboard.writeText(inviteUrl)}>Copy private link</button>
              </div>}
            </div>
          )}
          {(!inviteToken || inviteConsumed) && <div className="border-t border-noema-border pt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-neutral-400">Conversations</p>
            {!threads.length && <p className="text-xs text-neutral-500">No conversations yet.</p>}
            {threads.map((t) => (
              <button key={t.id} type="button" onClick={() => {
                setActiveId(t.id); activeIdRef.current = t.id; setMessages([]);
              }} className={"mb-2 block w-full rounded-lg border px-3 py-3 text-left text-sm " +
                (t.id === activeId ? "border-noema-lime text-white" : "border-noema-border text-neutral-400")}>
                {t.owner === session?.deviceId ? t.guestAlias : t.ownerAlias}
                <span className="mt-1 block text-[11px] text-neutral-500">#{t.id.slice(0, 8)}</span>
              </button>
            ))}
          </div>}
        </aside>
        {(!inviteToken || inviteConsumed) && <section className="flex min-h-[500px] flex-col overflow-hidden rounded-xl border border-noema-border bg-[#0d0d0f]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-noema-border bg-[#151517] px-4 py-3">
            <div>
              <p className="text-sm font-semibold">{activeThread ? (isOwner ? activeThread.guestAlias : activeThread.ownerAlias) : "Select a conversation"}</p>
              <p className="mt-1 text-[11px] text-neutral-500">Stored receipts only · No E2EE · Polling every 4 seconds</p>
            </div>
            {isOwner && activeThread && <button type="button" onClick={() => void toggleReception()}
              disabled={pending} aria-pressed={activeThread.receptionEnabled}
              className={activeThread.receptionEnabled
                ? "rounded-lg border border-noema-lime bg-noema-lime/10 px-3 py-2 text-xs font-semibold text-noema-lime"
                : button}>
              AI Reception: {activeThread.receptionEnabled ? (unlocked ? "ON" : "PAUSED · vault locked") : "OFF"}
            </button>}
            {!isOwner && activeThread?.receptionEnabled && <span className="text-xs text-noema-violet">AI receptionist may answer</span>}
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
            {messages.map((m) => {
              const mine = (isOwner && m.sender !== "guest") || (!isOwner && m.sender === "guest");
              return <div key={m.id} className={"max-w-[90%] rounded-lg border p-3 text-sm " +
                (mine ? "ml-auto border-noema-lime/20 bg-[#1d2718]" : "border-noema-border bg-[#1b1b1f]")}>
                {m.sender === "agent" && <p className="mb-1 text-[10px] font-semibold text-noema-violet">DISCLOSED AI RECEPTION</p>}
                <p className="whitespace-pre-wrap break-words">{m.content}</p>
                <p className="mt-2 text-right text-[10px] text-neutral-500">Stored · {new Date(m.createdAt).toLocaleTimeString()}</p>
              </div>;
            })}
            {workingAgent && <p className="text-xs text-noema-violet">AI receptionist responding…</p>}
          </div>
          {activeThread && <div className="flex items-end gap-2 border-t border-noema-border bg-[#151517] p-4">
            <textarea value={draft} maxLength={4000} rows={2} onChange={(e) => setDrafts((current) => ({...current,[activeId]:e.target.value}))}
              aria-label="Message to contact" placeholder="Write a message…" className={field} />
            <button type="button" disabled={!draft.trim() || pending} onClick={() => void send()}
              className="rounded-lg bg-noema-lime px-4 py-3 text-xs font-semibold text-black disabled:opacity-40">Send</button>
          </div>}
        </section>}
      </section>
      <p className="text-xs leading-5 text-neutral-500">
        Test service: use private trusted contacts only. Messages are held in the deployer’s Cloudflare account and are not end-to-end encrypted. The auto-reception agent runs only while the owner’s browser is open, their local API vault is unlocked, and reception is enabled. It cannot access MCP tools in this pilot.
      </p>
    </main>
  );
}
