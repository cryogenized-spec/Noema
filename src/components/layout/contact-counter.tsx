"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@iconify/react";
import {
  readCachedRelaySession, relayAvailable, relayGetThreads,
} from "@/lib/network/relay-client";

/** A small navigation indicator, not a second inbox or a background agent.
 * It makes real guest contacts visible while the owner uses AI Chat/Signals.
 * It uses an existing signed browser session and never reads message content.
 */
export function ContactCounter() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!relayAvailable) return;
    let mounted = true;
    let fetching = false;
    const refresh = async () => {
      if (fetching || document.visibilityState !== "visible") return;
      const session = readCachedRelaySession();
      if (!session) {
        if (mounted) setCount(null);
        return;
      }
      fetching = true;
      try {
        const response = await relayGetThreads(session);
        if (!mounted) return;
        setCount(response.threads.filter((thread) => thread.owner === session.deviceId).length);
      } catch {
        // A stale session is not equivalent to an empty inbox. Do not imply 0.
        if (mounted) setCount(null);
      } finally {
        fetching = false;
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 20000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      mounted = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);

  return (
    <Link href="/connect"
      title={count === null ? "Encrypted contact inbox" : `${count} guest contacts · Encrypted inbox`}
      aria-label={count === null ? "Open encrypted contacts"
        : `Open encrypted contacts (${count} guest contacts)`}
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
