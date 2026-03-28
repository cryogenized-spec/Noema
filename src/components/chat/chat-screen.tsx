"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { useChatStore } from "@/store/chat-store";
import { MessageBubble } from "@/components/chat/message-bubble";
import { MessageContextMenu } from "@/components/chat/context-menu";
import type { ChatMessage } from "@/types/chat";

export function ChatScreen() {
  const { messages, addMessage, hydrateMessages, hydrated, hydrating } = useChatStore();
  const [draft, setDraft] = useState("");
  const [agentPending, setAgentPending] = useState(false);
  const [menuState, setMenuState] = useState<{
    visible: boolean;
    x: number;
    y: number;
    message: ChatMessage | null;
  }>({ visible: false, x: 0, y: 0, message: null });

  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hydrated && !hydrating) {
      void hydrateMessages();
    }
  }, [hydrateMessages, hydrated, hydrating]);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, agentPending]);

  const hasMessages = messages.length > 0;

  const sendMessage = async () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    await addMessage({ role: "user", content: trimmed });
    setDraft("");
  };

  const askAgent = async (sourceMessage: ChatMessage) => {
    if (agentPending) return;
    setAgentPending(true);

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: sourceMessage.content,
          context: { action: "ask_agent", sourceMessageId: sourceMessage.id },
        }),
      });

      const payload = (await response.json()) as { content?: string; provider?: string; error?: string };
      const content = payload.content || "I could not generate a response.";

      await addMessage({
        role: "agent",
        content,
        metadata: { provider: payload.provider ?? "unknown" },
      });
    } catch {
      await addMessage({
        role: "system",
        content: "Agent request failed. Please try again.",
      });
    } finally {
      setAgentPending(false);
    }
  };

  const placeholder = useMemo(
    () =>
      "Start with a thought, clip, or task. Long-press any message to Ask Agent for a focused next step.",
    [],
  );

  return (
    <section className="flex h-full min-h-0 flex-col gap-3">
      <div
        ref={listRef}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-2xl border border-noema-border bg-noema-glassStrong p-3"
      >
        {!hasMessages ? (
          <div className="rounded-xl border border-dashed border-noema-borderSoft bg-slate-900/40 p-4 text-sm text-slate-300">
            {placeholder}
          </div>
        ) : (
          messages.map((message) => (
            <MessageBubble
              key={message.id ?? `${message.role}-${message.createdAt}`}
              message={message}
              onLongPress={(msg, x, y) =>
                setMenuState({ visible: true, message: msg, x, y })
              }
            />
          ))
        )}

        {agentPending && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-violet-300/25 bg-violet-500/16 px-3 py-2 text-xs text-slate-100">
              Noema Agent is drafting a response...
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-noema-border bg-noema-panel p-2 backdrop-blur-xl">
        <div className="flex items-end gap-2">
          <button
            type="button"
            aria-label="Attach file"
            className="shrink-0 rounded-xl border border-noema-borderSoft bg-slate-900/65 p-2 text-slate-300"
          >
            <Icon icon="solar:paperclip-bold" className="text-lg" />
          </button>

          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={1}
            placeholder="Message Noema"
            className="max-h-36 min-h-11 flex-1 resize-none rounded-xl border border-noema-borderSoft bg-slate-950/80 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void sendMessage();
              }
            }}
          />

          <button
            type="button"
            aria-label="Voice placeholder"
            className="shrink-0 rounded-xl border border-noema-borderSoft bg-slate-900/65 p-2 text-slate-300"
          >
            <Icon icon="solar:microphone-bold" className="text-lg" />
          </button>

          <button
            type="button"
            onClick={() => void sendMessage()}
            disabled={!draft.trim()}
            className="shrink-0 rounded-xl bg-violet-500 px-3 py-2 text-sm font-semibold text-white shadow-md shadow-violet-900/50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Send
          </button>
        </div>
      </div>

      <MessageContextMenu
        visible={menuState.visible}
        position={{ x: menuState.x, y: menuState.y }}
        message={menuState.message}
        busy={agentPending}
        onClose={() => setMenuState({ visible: false, x: 0, y: 0, message: null })}
        onAskAgent={askAgent}
      />
    </section>
  );
}
