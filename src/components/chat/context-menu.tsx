"use client";

import { useEffect, useMemo } from "react";
import { Icon } from "@iconify/react";
import type { ChatMessage } from "@/types/chat";
import {
  buildContextActionGroups,
  type ContextActionId,
  type MessagePressContext,
} from "@/lib/chat/context-actions";

interface MessageContextMenuProps {
  visible: boolean;
  message: ChatMessage | null;
  context: MessagePressContext | null;
  busy?: boolean;
  onClose: () => void;
  onAction: (action: ContextActionId, message: ChatMessage, context: MessagePressContext) => Promise<void>;
}

export function MessageContextMenu({
  visible,
  message,
  context,
  busy = false,
  onClose,
  onAction,
}: MessageContextMenuProps) {
  const groups = useMemo(() => {
    if (!message || !context) return [];
    return buildContextActionGroups(message, context);
  }, [context, message]);

  useEffect(() => {
    if (!visible) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, visible]);

  if (!visible || !message || !context) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Dismiss action sheet"
        className="fixed inset-0 z-30 bg-black/45 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <section className="fixed inset-x-0 bottom-0 z-40 rounded-t-3xl border border-noema-border bg-[#12182e]/97 px-4 pb-6 pt-3 shadow-[0_-16px_50px_rgba(2,6,23,0.72)]">
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-500/80" />
        <header className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-100">Message actions</p>
            <p className="line-clamp-2 text-xs text-slate-400">{message.content}</p>
          </div>
          <button
            type="button"
            className="rounded-full border border-noema-borderSoft bg-slate-900/80 p-2 text-slate-300"
            onClick={onClose}
            aria-label="Close action sheet"
          >
            <Icon icon="solar:close-circle-bold" className="text-lg" />
          </button>
        </header>

        <div className="max-h-[62vh] space-y-4 overflow-y-auto pb-2">
          {groups.map((group) => (
            <div key={group.title} className="space-y-2">
              <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{group.title}</p>
              <div className="space-y-2">
                {group.actions.map((action) => {
                  const isDisabled = busy || action.placeholder;
                  return (
                    <button
                      key={action.id}
                      type="button"
                      disabled={isDisabled}
                      className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm ${
                        action.destructive
                          ? "border-rose-400/25 bg-rose-500/10 text-rose-200"
                          : "border-noema-borderSoft bg-slate-900/70 text-slate-100"
                      } ${isDisabled ? "cursor-not-allowed opacity-60" : "active:scale-[0.99]"}`}
                      onClick={async () => {
                        if (isDisabled) return;
                        await onAction(action.id, message, context);
                        onClose();
                      }}
                    >
                      <span>{action.label}</span>
                      <span className="text-[11px] text-slate-400">
                        {action.placeholder ? action.description ?? "Coming soon" : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
