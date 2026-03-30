"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { useChatStore } from "@/store/chat-store";
import { useAgentStore } from "@/store/agent-store";
import { useLockboxStore } from "@/store/lockbox-store";
import { MessageBubble } from "@/components/chat/message-bubble";
import { MessageContextMenu } from "@/components/chat/context-menu";
import { MarkdownHelperMenu } from "@/components/markdown/markdown-helper-menu";
import { SelectionActionBar } from "@/components/chat/selection-action-bar";
import { VoiceCaptureButton } from "@/components/voice/voice-capture-button";
import { applyMarkdownInsertion, type MarkdownHelperAction } from "@/lib/markdown/authoring";
import type { ContextActionId, MessagePressContext } from "@/lib/chat/context-actions";
import { createNoteFromMessageSelection, createNoteFromSingleMessage } from "@/lib/notes/conversion";
import { renderCanonicalNote } from "@/lib/notes/export-architecture";
import { PROVIDER_CATALOG } from "@/lib/providers/catalog";
import { buildAgentExecutionPayload } from "@/lib/runtime/payload-builder";
import { createInvocationDescriptor } from "@/lib/runtime/invocation-descriptor";
import { hasProviderAdapter } from "@/lib/ai/provider-registry";
import type { AgentProfile } from "@/types/agents";
import type { ChatMessage } from "@/types/chat";
import type { AgentInvocationMode } from "@/lib/runtime/types";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const fontClassFromAgent = (agent: AgentProfile) => {
  switch (agent.fontFamily) {
    case "manrope":
      return "font-agent-manrope";
    case "ibm_plex_sans":
      return "font-agent-ibm";
    case "space_grotesk":
      return "font-agent-space";
    case "merriweather":
      return "font-agent-merriweather";
    case "jetbrains_mono":
      return "font-agent-jetbrains";
    default:
      return "font-agent-inter";
  }
};

type PendingInvocation = {
  prompt: string;
  mode: AgentInvocationMode;
  outputVisibility: "public" | "ghost";
  targetMessageId?: number;
};

export function ChatScreen() {
  const {
    messages,
    addMessage,
    hydrateMessages,
    hydrated,
    hydrating,
    updateMessage,
    deleteMessage,
    threads,
    activeThreadKey,
    setThreadAgentId,
  } = useChatStore();
  const { agents, hydrateAgents } = useAgentStore();
  const { records, hydrate: hydrateLockbox, revealKey } = useLockboxStore();

  const [draft, setDraft] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [agentPending, setAgentPending] = useState(false);
  const [showMarkdownMenu, setShowMarkdownMenu] = useState(false);
  const [showAgentPicker, setShowAgentPicker] = useState(false);
  const [pendingInvocation, setPendingInvocation] = useState<PendingInvocation | null>(null);
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
    void hydrateAgents();
    hydrateLockbox();
  }, [hydrateAgents, hydrateLockbox]);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, agentPending]);

  const selectedMessages = useMemo(
    () => messages.filter((message) => message.id !== undefined && selectedIds.includes(message.id)),
    [messages, selectedIds],
  );

  const activeThread = useMemo(() => threads.find((thread) => thread.threadKey === activeThreadKey) ?? null, [threads, activeThreadKey]);
  const activeAgentId = activeThread?.selectedAgentId ?? null;
  const activeAgent = useMemo(() => agents.find((agent) => agent.id === activeAgentId) ?? null, [agents, activeAgentId]);

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

  const insertAgentResponse = async (
    agent: AgentProfile,
    content: string,
    mode: AgentInvocationMode,
    outputVisibility: "public" | "ghost",
    targetMessageId?: number,
  ) => {
    const provider = PROVIDER_CATALOG.find((item) => item.id === agent.providerId);

    return addMessage({
      role: "agent",
      content,
      metadata: {
        provider: provider?.displayName ?? agent.providerId,
        providerId: agent.providerId,
        modelId: agent.modelId,
        invocationMode: mode,
        agentId: agent.id,
        agentName: agent.name,
        streamingMode: agent.streamingMode,
        outputMode: outputVisibility,
        targetMessageId,
        agentStyle: {
          avatarImage: agent.avatarImage,
          avatarShape: agent.avatarShape,
          fontFamilyClass: fontClassFromAgent(agent),
          fontColor: agent.fontColor,
          accentColor: agent.accentColor,
        },
      },
    });
  };

  const invokeWithAgent = async (
    agent: AgentProfile,
    prompt: string,
    mode: AgentInvocationMode,
    outputVisibility: "public" | "ghost",
    targetMessageId?: number,
  ) => {
    if (!hasProviderAdapter(agent.providerId)) {
      await addMessage({ role: "system", content: `Provider adapter for ${agent.providerId} is not available yet.` });
      return;
    }

    const provider = PROVIDER_CATALOG.find((item) => item.id === agent.providerId);
    const model = provider?.models.find((item) => item.modelId === agent.modelId);

    if (!provider || !model) {
      await addMessage({ role: "system", content: "Selected agent has invalid provider/model metadata." });
      return;
    }

    const providerConfig = records.find((record) => record.providerId === agent.providerId);
    if (!providerConfig) {
      await addMessage({ role: "system", content: `Configure ${provider.displayName} in API Lockbox before invoking this agent.` });
      return;
    }

    const apiKey = await revealKey(agent.providerId);

    const built = buildAgentExecutionPayload({
      invocation: createInvocationDescriptor({
        threadId: activeThreadKey,
        sourceMessageId: targetMessageId,
        sourceMessageContent: prompt,
        agentId: agent.id ?? -1,
        mode,
        outputMode: outputVisibility,
      }),
      agent,
      provider,
      model,
      providerConfig,
      providerApiKey: apiKey,
      prompt,
      conversation: messages.slice(-8).map((item) => ({ role: item.role === "agent" ? "assistant" : item.role, content: item.content })),
      streamingMode: agent.streamingMode,
    });

    if (!built.ok) {
      await addMessage({ role: "system", content: `${built.message}${built.detail ? ` (${built.detail})` : ""}` });
      return;
    }

    const response = await fetch("/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, executionPayload: built.payload }),
    });

    const payload = (await response.json()) as { content?: string; error?: unknown };
    if (!response.ok || !payload.content) {
      await addMessage({ role: "system", content: "Agent request failed. Check Lockbox/provider setup and try again." });
      return;
    }

    if (agent.streamingMode === "oneshot") {
      await insertAgentResponse(agent, payload.content, mode, outputVisibility, targetMessageId);
      return;
    }

    const created = await insertAgentResponse(agent, "", mode, outputVisibility, targetMessageId);
    if (!created?.id) return;

    const chunks =
      agent.streamingMode === "chunked"
        ? payload.content.match(/.{1,80}(\s|$)/g) ?? [payload.content]
        : payload.content.match(/.{1,28}(\s|$)/g) ?? [payload.content];

    let assembled = "";
    for (const chunk of chunks) {
      assembled += chunk;
      await updateMessage(created.id, assembled);
      await sleep(agent.streamingMode === "chunked" ? 90 : 35);
    }
  };

  const runDirectAgentReply = async (prompt: string) => {
    if (!activeAgent) return;
    await invokeWithAgent(activeAgent, prompt, "direct_chat", "public");
  };

  const queueInvocationWithPicker = (invocation: PendingInvocation) => {
    setPendingInvocation(invocation);
    setShowAgentPicker(true);
  };

  const runMessageInvocation = async (
    message: ChatMessage,
    mode: AgentInvocationMode,
    outputVisibility: "public" | "ghost",
    useDifferentAgent = false,
  ) => {
    const prompt = message.content;
    const targetMessageId = message.id;

    if (!useDifferentAgent && activeAgent) {
      await invokeWithAgent(activeAgent, prompt, mode, outputVisibility, targetMessageId);
      return;
    }

    queueInvocationWithPicker({ prompt, mode, outputVisibility, targetMessageId });
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

    if (!activeAgent || agentPending) return;

    setAgentPending(true);
    try {
      await runDirectAgentReply(trimmed);
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

    if (action === "ask_agent") {
      await runMessageInvocation(message, "long_press_ask", "public", false);
      return;
    }

    if (action === "ask_agent_different") {
      await runMessageInvocation(message, "long_press_ask", "public", true);
      return;
    }

    if (action === "summarize") {
      await runMessageInvocation(message, "summarize_message", "ghost", false);
      return;
    }

    if (action === "rewrite_message") {
      await runMessageInvocation(message, "rewrite_message", "public", false);
      return;
    }

    if (action === "explain_message") {
      await runMessageInvocation(message, "explain_message", "public", false);
      return;
    }

    if (action === "translate") {
      await addMessage({ role: "system", content: "Translate is planned but not implemented yet." });
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

    if (action === "open_link" && context.kind === "link") {
      window.open(context.href, "_blank", "noopener,noreferrer");
      return;
    }

    if (action === "copy_link" && context.kind === "link") {
      await navigator.clipboard.writeText(context.href);
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
            Start with a thought, clip, or task. Long-press a message to enter multi-select mode.
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
              Agent is replying...
            </div>
          </div>
        )}
      </div>

      <div className="relative rounded-2xl border border-noema-border bg-noema-panel p-2 backdrop-blur-xl">
        <div className="mb-2 flex items-center justify-between gap-2">
          <button
            type="button"
            className="rounded-full border border-noema-borderSoft bg-slate-900/75 px-3 py-1 text-xs text-slate-200"
            onClick={() => setShowAgentPicker((current) => !current)}
          >
            {activeAgent ? `Agent: ${activeAgent.name}` : "No active agent"}
          </button>
          {activeAgent && (
            <button
              type="button"
              className="rounded-md border border-noema-borderSoft px-2 py-1 text-[11px] text-slate-300"
              onClick={() => void setThreadAgentId(activeThreadKey, null)}
            >
              Clear
            </button>
          )}
        </div>

        {showAgentPicker && (
          <div className="mb-2 max-h-36 overflow-y-auto rounded-xl border border-noema-borderSoft bg-slate-950/85 p-2">
            {pendingInvocation && <p className="mb-1 text-[11px] text-violet-300">Pick an agent for this invocation</p>}
            {agents.length === 0 ? (
              <p className="text-xs text-slate-400">No agents yet. Create one in Agent Studio.</p>
            ) : (
              <div className="space-y-1">
                {agents.map((agent) => (
                  <button
                    key={agent.id}
                    type="button"
                    className={`block w-full rounded-lg px-2 py-1 text-left text-xs ${activeAgentId === agent.id ? "bg-violet-500/20 text-slate-100" : "text-slate-300 hover:bg-white/5"}`}
                    onClick={async () => {
                      await setThreadAgentId(activeThreadKey, agent.id ?? null);
                      setShowAgentPicker(false);

                      if (pendingInvocation) {
                        setPendingInvocation(null);
                        setAgentPending(true);
                        try {
                          await invokeWithAgent(agent, pendingInvocation.prompt, pendingInvocation.mode, pendingInvocation.outputVisibility, pendingInvocation.targetMessageId);
                        } finally {
                          setAgentPending(false);
                        }
                      }
                    }}
                  >
                    {agent.name} · {agent.providerId}/{agent.modelId}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex items-end gap-2">
          <button
            type="button"
            aria-label="Markdown helpers"
            className="shrink-0 rounded-xl border border-noema-borderSoft bg-slate-900/65 p-2 text-slate-300"
            onClick={() => setShowMarkdownMenu((current) => !current)}
          >
            <Icon icon="solar:text-field-focus-bold" className="text-lg" />
          </button>

          <textarea
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={1}
            placeholder={activeAgent ? `Message ${activeAgent.name}` : "Message Noema"}
            className="max-h-36 min-h-11 flex-1 resize-none rounded-xl border border-noema-borderSoft bg-slate-950/80 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void sendMessage();
              }
            }}
          />

          <VoiceCaptureButton
            compact
            onTranscript={(text) => setDraft((current) => `${current} ${text}`.trim())}
            onError={(error) => {
              void addMessage({ role: "system", content: `Voice capture failed: ${error.message}` });
            }}
          />

          <button
            type="button"
            onClick={() => void sendMessage()}
            disabled={!draft.trim() || agentPending}
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
