"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@iconify/react";
import {
  readCachedRelaySession, relayAvailable, relayGetMessages, relayGetThreads,
} from "@/lib/network/relay-client";
import {
  CONTACT_READ_EVENT, CONTACT_READ_PREFIX,
  lastReadIncoming, unreadIncomingCount,
} from "@/lib/network/contact-unread";

/** A small navigation indicator, not a second inbox or a background agent.
 * It makes real guest contacts visible while the owner uses AI Chat/Signals.
 * It uses an existing signed browser session and reads sender/sequence metadata
 * from encrypted envelopes, never decrypting message text.
 */
export function ContactCounter() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!relayAvailable) return;
    let mounted = true;
    let fetching = false;
    let retryAfterFetch = false;
    const refresh = async () => {
      if (fetching) { retryAfterFetch = true; return; }
      if (document.visibilityState !== "visible") return;
      const session = readCachedRelaySession();
      if (!session) {
        if (mounted) setCount(null);
        return;
      }
      fetching = true;
      try {
        const response = await relayGetThreads(session);
        if (!mounted) return;
        // Contacts are not notifications. Count only *incoming guest*
        // messages newer than this browser's last viewed guest sequence.
        const owned = response.threads.filter(thread => thread.owner === session.deviceId);
        const counts = await Promise.all(owned.map(async thread => {
          const seen = lastReadIncoming(session.deviceId, thread.id);
          if (thread.nextSeq <= seen) return 0;
          const result = await relayGetMessages(session, thread.id, seen);
          // Re-read after the request: the inbox may have marked this thread
          // viewed while the counter's network request was in flight.
          return unreadIncomingCount(result.messages,
            lastReadIncoming(session.deviceId, thread.id));
        }));
        if(mounted)setCount(counts.reduce((total,n)=>total+n,0));
      } catch {
        // A stale session is not equivalent to an empty inbox. Do not imply 0.
        if (mounted) setCount(null);
      } finally {
        fetching = false;
        if(retryAfterFetch && mounted) {
          retryAfterFetch = false;
          void refresh();
        }
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 20000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener(CONTACT_READ_EVENT, onFocus);
    const onStorage = (event: StorageEvent) => {
      if(!event.key || event.key.startsWith(CONTACT_READ_PREFIX))void refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      mounted = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener(CONTACT_READ_EVENT, onFocus);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return (
    <Link href={relayAvailable ? "/connect" : "https://noema-contact-staging.vercel.app/connect"}
      title={count === null ? "Encrypted contact inbox" : count===0 ? "No unread guest messages" : `${count} unread guest messages`}
      aria-label={count === null ? "Open encrypted contacts"
        : count===0 ? "Open encrypted contacts (no unread guest messages)"
        : `Open encrypted contacts (${count} unread guest messages)`}
      className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-noema-border bg-[#171719] text-neutral-300 transition hover:border-noema-lime hover:text-noema-lime">
      <Icon icon="solar:chat-round-dots-linear" className="text-xl" aria-hidden="true" />
      {count !== null && count > 0 && (
        <span className="absolute -right-1 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full border border-[#0b0b0d] bg-noema-lime px-0.5 text-[9px] font-bold text-black">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}
