"use client";

import { Icon } from "@iconify/react";
import Image from "next/image";
import { useRef } from "react";
import type { ChatMessage } from "@/types/chat";
import { MarkdownMessage } from "@/components/chat/markdown-message";
import type { MessagePressContext } from "@/lib/chat/context-actions";

interface MessageBubbleProps {
  message: ChatMessage;
  isContextActive?: boolean;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect: (message: ChatMessage) => void;
  onLongPress: (message: ChatMessage, context: MessagePressContext) => void;
  onContextActionOpen: (message: ChatMessage, context: MessagePressContext) => void;
}

const LONG_PRESS_DELAY = 460;
const MOVE_CANCEL_THRESHOLD = 12;

export function MessageBubble({
  message,
  onLongPress,
  onContextActionOpen,
  onToggleSelect,
  isContextActive = false,
  selectionMode = false,
  selected = false,
}: MessageBubbleProps) {
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPointRef = useRef<{ x: number; y: number } | null>(null);
  const touchedRef = useRef(false);

  const clearLongPress = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
    startPointRef.current = null;
  };

  const getPressContext = (target: EventTarget | null): MessagePressContext => {
    const element = target instanceof HTMLElement ? target : null;
    if (!element) return { kind: "message" };

    const link = element.closest("a[href]") as HTMLAnchorElement | null;
    if (link?.href) {
      return { kind: "link", href: link.href, text: link.textContent ?? undefined };
    }

    const codeContainer = element.closest("[data-noema-code='true']") as HTMLElement | null;
    if (codeContainer) {
      return {
        kind: "code",
        code: codeContainer.dataset.codeValue ?? "",
        language: codeContainer.dataset.codeLanguage ?? "text",
      };
    }

    return { kind: "message" };
  };

  const startLongPress = (x: number, y: number, context: MessagePressContext) => {
    clearLongPress();
    startPointRef.current = { x, y };
    pressTimerRef.current = setTimeout(() => {
      onLongPress(message, context);
      pressTimerRef.current = null;
    }, LONG_PRESS_DELAY);
  };

  const maybeCancelForMove = (x: number, y: number) => {
    const start = startPointRef.current;
    if (!start || !pressTimerRef.current) return;

    if (Math.abs(x - start.x) > MOVE_CANCEL_THRESHOLD || Math.abs(y - start.y) > MOVE_CANCEL_THRESHOLD) {
      clearLongPress();
    }
  };

  const isUser = message.role === "user";
  const isAgent = message.role === "agent";
  const agentStyle = message.metadata?.agentStyle;
  const fontClass = typeof agentStyle?.fontFamilyClass === "string" ? agentStyle.fontFamilyClass : "";
  const fontColor = typeof agentStyle?.fontColor === "string" ? agentStyle.fontColor : undefined;
  const accentColor = typeof agentStyle?.accentColor === "string" ? agentStyle.accentColor : undefined;
  const avatarShape = agentStyle?.avatarShape === "portrait" ? "portrait" : agentStyle?.avatarShape === "square" ? "square" : "circle";
  const avatarImage = typeof agentStyle?.avatarImage === "string" ? agentStyle.avatarImage : "";
  const outputVisibility = message.metadata?.outputVisibility === "ghost" ? "ghost" : "public";

  return (
    <article className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      {isAgent && !isUser && (
        <div className={`mr-2 mt-1 shrink-0 overflow-hidden border border-noema-borderSoft bg-slate-800 ${avatarShape === "circle" ? "h-8 w-8 rounded-full" : avatarShape === "portrait" ? "h-10 w-8 rounded-lg" : "h-8 w-8 rounded-lg"}`}>
          {avatarImage ? (
            <Image src={avatarImage} alt="Agent avatar" width={80} height={80} className="h-full w-full object-cover" unoptimized />
          ) : (
            <div className="flex h-full items-center justify-center text-[10px] text-slate-200">AI</div>
          )}
        </div>
      )}
      <div
        className={`relative max-w-[88%] rounded-2xl border px-3 py-2.5 text-sm transition ${
          isUser
            ? "border-blue-300/20 bg-blue-500/18 text-slate-100"
            : isAgent
              ? "border-violet-300/20 bg-violet-500/18 text-slate-100"
              : "border-slate-400/20 bg-slate-800/75 text-slate-100"
        } ${outputVisibility === "ghost" ? "border-dashed bg-slate-900/60" : ""} ${isContextActive ? "ring-2 ring-violet-300/70 ring-offset-2 ring-offset-slate-950" : ""} ${
          selected ? "ring-2 ring-emerald-300/80 ring-offset-2 ring-offset-slate-950" : ""
        }`}
        style={accentColor ? { borderColor: accentColor } : undefined}
        onClick={() => {
          if (selectionMode) {
            onToggleSelect(message);
          }
        }}
        onTouchStart={(event) => {
          touchedRef.current = true;
          const touch = event.touches[0];
          startLongPress(touch.clientX, touch.clientY, getPressContext(event.target));
        }}
        onTouchMove={(event) => {
          const touch = event.touches[0];
          maybeCancelForMove(touch.clientX, touch.clientY);
        }}
        onTouchEnd={clearLongPress}
        onTouchCancel={clearLongPress}
        onMouseDown={(event) => {
          if (touchedRef.current) return;
          startLongPress(event.clientX, event.clientY, getPressContext(event.target));
        }}
        onMouseMove={(event) => {
          if (touchedRef.current) return;
          maybeCancelForMove(event.clientX, event.clientY);
        }}
        onMouseUp={() => {
          if (touchedRef.current) {
            touchedRef.current = false;
            return;
          }
          clearLongPress();
        }}
        onMouseLeave={() => {
          touchedRef.current = false;
          clearLongPress();
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          onContextActionOpen(message, getPressContext(event.target));
        }}
      >
        {!selectionMode && (
          <button
            type="button"
            aria-label="Message actions"
            className="absolute -right-2 -top-2 rounded-full border border-noema-borderSoft bg-slate-900/90 p-1 text-slate-300"
            onClick={(event) => {
              event.stopPropagation();
              onContextActionOpen(message, { kind: "message" });
            }}
          >
            <Icon icon="solar:menu-dots-bold" className="text-sm" />
          </button>
        )}

        {selectionMode && (
          <div
            className={`absolute -left-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border text-[11px] ${
              selected
                ? "border-emerald-200/80 bg-emerald-500 text-white"
                : "border-slate-300/40 bg-slate-900/90 text-slate-300"
            }`}
          >
            {selected ? <Icon icon="solar:check-circle-bold" /> : ""}
          </div>
        )}

        {outputVisibility === "ghost" && (
          <p className="mb-1 text-[10px] uppercase tracking-wide text-amber-300">Private result</p>
        )}
        <MarkdownMessage content={message.content} className={fontClass} style={fontColor ? { color: fontColor } : undefined} />
        <p className="mt-1 text-right text-[10px] text-slate-400">
          {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
    </article>
  );
}
