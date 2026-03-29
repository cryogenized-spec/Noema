"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { useChatStore } from "@/store/chat-store";
import { MessageBubble } from "@/components/chat/message-bubble";
import { MessageContextMenu } from "@/components/chat/context-menu";
import { MarkdownHelperMenu } from "@/components/markdown/markdown-helper-menu";
import { SelectionActionBar } from "@/components/chat/selection-action-bar";
import { applyMarkdownInsertion, type MarkdownHelperAction } from "@/lib/markdown/authoring";
import type { ContextActionId, MessagePressContext } from "@/lib/chat/context-actions";
import { createNoteFromMessageSelection, createNoteFromSingleMessage } from "@/lib/notes/conversion";
import { renderCanonicalNote } from "@/lib/notes/export-architecture";
import type { ChatMessage } from "@/types/chat";

export function ChatScreen() {
  const { messages, addMessage, hydrateMessages, hydrated, hydrating, updateMessage, deleteMessage } = useChatStore();
  const [draft, setDraft] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [agentPending, setAgentPending] = useState(false);
  const [showMarkdownMenu, setShowMarkdownMenu] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [menuState, setMenuState] = useState<{
    visible: boolean;
    message: ChatMessage | null;
    context: MessagePressContext | null;
  }>({ visible: false, message: null, context: null });

  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!hydrated && !hydrating) {
      void hydrateMessages();
    }
  }, [hydrateMessages, hydrated, hydrating]);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, agentPending]);

  const selectedMessages = useMemo(
    () => messages.filter((message) => message.id !== undefined && selectedIds.includes(message.id)),
    [messages, selectedIds],
  );

  const selectedCount = selectedMessages.length;
  const hasMessages = messages.length > 0;

  const clearSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds([]);
  };

  const toggleSelectMessage = (message: ChatMessage) => {
    if (message.id === undefined) return;
    setSelectedIds((current) =>
      current.includes(message.id as number) ? current.filter((id) => id !== message.id) : [...current, message.id as number],
    );
  };

  useEffect(() => {
    if (selectionMode && selectedIds.length === 0) {
      setSelectionMode(false);
    }
  }, [selectedIds.length, selectionMode]);

  const enterSelectionMode = (message: ChatMessage) => {
    if (message.id === undefined) return;
    setMenuState({ visible: false, message: null, context: null });
    setSelectionMode(true);
    setSelectedIds((current) => (current.includes(message.id as number) ? current : [...current, message.id as number]));
  };

  const copySelectedMessages = async () => {
    const payload = selectedMessages
      .map((message) => `[${message.role.toUpperCase()} ${new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}]\n${message.content}`)
      .join("\n\n---\n\n");
    await navigator.clipboard.writeText(payload);
    clearSelectionMode();
  };

  const deleteSelectedMessages = async () => {
    const ownMessages = selectedMessages.filter((message) => message.role === "user" && message.id !== undefined);
    const skipped = selectedMessages.length - ownMessages.length;

    for (const message of ownMessages) {
      if (message.id !== undefined) {
        await deleteMessage(message.id);
      }
    }

    if (skipped > 0) {
      await addMessage({
        role: "system",
        content: `Deleted ${ownMessages.length} own message(s). Skipped ${skipped} non-user message(s).`,
      });
    }

    clearSelectionMode();
  };

  const convertSelectedToNote = async () => {
    const note = createNoteFromMessageSelection(selectedMessages);
    const rendered = renderCanonicalNote(note);

    await navigator.clipboard.writeText(rendered.markdown);
    await addMessage({
      role: "system",
      content: `Converted selection to Obsidian-ready note draft (${rendered.filename}) and copied it to clipboard.`,
    });
    clearSelectionMode();
  };

  const sendMessage = async () => {
    const trimmed = draft.trim();
    if (!trimmed) return;

    if (editingMessageId !== null) {
      await updateMessage(editingMessageId, trimmed);
      setEditingMessageId(null);
      setDraft("");
      return;
    }

    await addMessage({ role: "user", content: trimmed });
    setDraft("");
  };

  const runAgentAction = async (
    prompt: string,
    action: "ask_agent" | "summarize" | "extract_tasks" | "explain_code" | "analyze",
    source?: ChatMessage,
  ) => {
    if (agentPending) return;
    setAgentPending(true);

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          context: source ? { action, sourceMessageId: source.id } : { action },
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

  const handleContextAction = async (action: ContextActionId, message: ChatMessage, context: MessagePressContext) => {
    if (action === "copy") {
      await navigator.clipboard.writeText(message.content);
      return;
    }

    if (action === "reply_quote") {
      const next = `> ${message.content.replace(/\n/g, "\n> ")}\n\n`;
      setDraft((current) => (current ? `${current}\n\n${next}` : next));
      window.requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }

    if (action === "share") {
      if (navigator.share) {
        await navigator.share({ text: message.content });
      } else {
        await navigator.clipboard.writeText(message.content);
        await addMessage({ role: "system", content: "Share is unavailable here, so content was copied instead." });
      }
      return;
    }

    if (action === "convert_note") {
      const note = createNoteFromSingleMessage(message);
      const rendered = renderCanonicalNote(note);
      await navigator.clipboard.writeText(rendered.markdown);
      await addMessage({
        role: "system",
        content: `Converted message to Obsidian-ready note draft (${rendered.filename}) and copied it to clipboard.`,
      });
      return;
    }

    if (action === "translate") {
      await addMessage({ role: "system", content: "Translate is planned but not implemented yet." });
      return;
    }

    if (action === "ask_agent") {
      await runAgentAction(message.content, "ask_agent", message);
      return;
    }

    if (action === "summarize") {
      await runAgentAction(`Summarize this message:\n\n${message.content}`, "summarize", message);
      return;
    }

    if (action === "extract_tasks") {
      await runAgentAction(`Extract concrete tasks and a checklist from:\n\n${message.content}`, "extract_tasks", message);
      return;
    }

    if (action === "edit") {
      if (!message.id) return;
      setEditingMessageId(message.id);
      setDraft(message.content);
      window.requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }

    if (action === "delete") {
      if (!message.id) return;
      await deleteMessage(message.id);
      return;
    }

    if (action === "copy_code" && context.kind === "code") {
      await navigator.clipboard.writeText(context.code);
      return;
    }

    if (action === "copy_markdown" && context.kind === "code") {
      const fenced = `\`\`\`${context.language}\n${context.code}\n\`\`\``;
      await navigator.clipboard.writeText(fenced);
      return;
    }

    if (action === "explain_code" && context.kind === "code") {
      await runAgentAction(
        `Explain this ${context.language} code:\n\n\`\`\`${context.language}\n${context.code}\n\`\`\``,
        "explain_code",
        message,
      );
      return;
    }

    if (action === "open_link" && context.kind === "link") {
      window.open(context.href, "_blank", "noopener,noreferrer");
      return;
    }

    if (action === "copy_link" && context.kind === "link") {
      await navigator.clipboard.writeText(context.href);
      return;
    }

    if (action === "ask_agent_link" && context.kind === "link") {
      await runAgentAction(`Analyze this link and explain what I should know before opening it: ${context.href}`, "analyze", message);
      return;
    }
  };

  const applyHelper = (action: MarkdownHelperAction) => {
    const input = inputRef.current;
    if (!input) return;

    const result = applyMarkdownInsertion({
      value: draft,
      selectionStart: input.selectionStart ?? draft.length,
      selectionEnd: input.selectionEnd ?? draft.length,
      action,
    });

    setDraft(result.value);
    setShowMarkdownMenu(false);

    window.requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  };

  const placeholder = useMemo(
    () =>
      "Start with a thought, clip, or task. Long-press a message to enter multi-select mode.",
    [],
  );

  return (
    <section className="flex h-full min-h-0 flex-col gap-3">
      {selectionMode && (
        <SelectionActionBar
          selectedCount={selectedCount}
          onClose={clearSelectionMode}
          onCopy={copySelectedMessages}
          onDelete={deleteSelectedMessages}
          onConvertToNote={convertSelectedToNote}
        />
      )}

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
              selectionMode={selectionMode}
              selected={message.id !== undefined ? selectedIds.includes(message.id) : false}
              isContextActive={menuState.visible && menuState.message?.id === message.id}
              onToggleSelect={toggleSelectMessage}
              onLongPress={(msg) => {
                if (selectionMode) {
                  toggleSelectMessage(msg);
                  return;
                }
                enterSelectionMode(msg);
              }}
              onContextActionOpen={(msg, context) => {
                if (selectionMode) return;
                setMenuState({ visible: true, message: msg, context });
              }}
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

      <div className="relative rounded-2xl border border-noema-border bg-noema-panel p-2 backdrop-blur-xl">
        <div className="mb-1 flex items-center justify-between px-1 text-[11px] text-slate-400">
          <span>{editingMessageId !== null ? "Editing message" : "Compose"}</span>
          {editingMessageId !== null && (
            <button
              type="button"
              className="rounded-md border border-noema-borderSoft px-2 py-0.5 text-[11px] text-slate-200"
              onClick={() => {
                setEditingMessageId(null);
                setDraft("");
              }}
            >
              Cancel edit
            </button>
          )}
        </div>

        <div className="flex items-end gap-2">
          <button
            type="button"
            aria-label="Markdown helpers"
            className="shrink-0 rounded-xl border border-noema-borderSoft bg-slate-900/65 p-2 text-slate-300"
            onClick={() => setShowMarkdownMenu((current) => !current)}
          >
            <Icon icon="solar:text-field-focus-bold" className="text-lg" />
          </button>

          <button
            type="button"
            aria-label="Attach file"
            className="shrink-0 rounded-xl border border-noema-borderSoft bg-slate-900/65 p-2 text-slate-300"
          >
            <Icon icon="solar:paperclip-bold" className="text-lg" />
          </button>

          <textarea
            ref={inputRef}
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
            {editingMessageId !== null ? "Save" : "Send"}
          </button>
        </div>
        {showMarkdownMenu && <MarkdownHelperMenu onAction={applyHelper} />}
      </div>

      <MessageContextMenu
        visible={menuState.visible && !selectionMode}
        message={menuState.message}
        context={menuState.context}
        busy={agentPending}
        onClose={() => setMenuState({ visible: false, message: null, context: null })}
        onAction={handleContextAction}
      />
    </section>
  );
}
