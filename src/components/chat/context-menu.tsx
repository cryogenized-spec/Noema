"use client";

import { useMemo } from "react";
import type { ChatMessage } from "@/types/chat";

interface MessageContextMenuProps {
  visible: boolean;
  position: { x: number; y: number };
  message: ChatMessage | null;
  busy?: boolean;
  onClose: () => void;
  onAskAgent: (message: ChatMessage) => Promise<void>;
}

export function MessageContextMenu({
  visible,
  position,
  message,
  busy = false,
  onClose,
  onAskAgent,
}: MessageContextMenuProps) {
  const safePosition = useMemo(() => {
    const viewportWidth = typeof window === "undefined" ? 360 : window.innerWidth;
    const viewportHeight = typeof window === "undefined" ? 640 : window.innerHeight;

    return {
      left: Math.max(8, Math.min(position.x, viewportWidth - 210)),
      top: Math.max(8, Math.min(position.y, viewportHeight - 180)),
    };
  }, [position.x, position.y]);

  if (!visible || !message) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Dismiss message menu"
        className="fixed inset-0 z-20 bg-black/30"
        onClick={onClose}
      />
      <section
        className="fixed z-30 min-w-44 rounded-xl border border-white/20 bg-[#171a32]/95 p-1 shadow-2xl backdrop-blur-xl"
        style={safePosition}
      >
        <button
          type="button"
          className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(message.content);
            } finally {
              onClose();
            }
          }}
        >
          Copy
        </button>
        <button
          type="button"
          disabled={busy}
          className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10 disabled:cursor-not-allowed disabled:text-slate-400"
          onClick={async () => {
            await onAskAgent(message);
            onClose();
          }}
        >
          {busy ? "Ask Agent (Working...)" : "Ask Agent"}
        </button>
        <button
          type="button"
          disabled
          className="block w-full cursor-not-allowed rounded-lg px-3 py-2 text-left text-sm text-slate-400"
        >
          Translate (Coming soon)
        </button>
      </section>
    </>
  );
}
