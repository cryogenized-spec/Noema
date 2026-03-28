"use client";

import { useRef } from "react";
import type { ChatMessage } from "@/types/chat";
import { MarkdownMessage } from "@/components/chat/markdown-message";

interface MessageBubbleProps {
  message: ChatMessage;
  onLongPress: (message: ChatMessage, x: number, y: number) => void;
}

export function MessageBubble({ message, onLongPress }: MessageBubbleProps) {
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startLongPress = (x: number, y: number) => {
    pressTimerRef.current = setTimeout(() => {
      onLongPress(message, x, y);
    }, 450);
  };

  const clearLongPress = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  const isUser = message.role === "user";

  return (
    <article className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[88%] rounded-2xl border px-3 py-2.5 text-sm ${
          isUser
            ? "border-blue-300/20 bg-blue-500/24 text-slate-50"
            : message.role === "agent"
              ? "border-violet-200/20 bg-violet-500/14 text-slate-50"
              : "border-slate-300/20 bg-slate-600/35 text-slate-100"
        }`}
        onTouchStart={(event) => {
          const touch = event.touches[0];
          startLongPress(touch.clientX, touch.clientY);
        }}
        onTouchEnd={clearLongPress}
        onTouchCancel={clearLongPress}
        onMouseDown={(event) => startLongPress(event.clientX, event.clientY)}
        onMouseUp={clearLongPress}
        onMouseLeave={clearLongPress}
        onContextMenu={(event) => {
          event.preventDefault();
          onLongPress(message, event.clientX, event.clientY);
        }}
      >
        <MarkdownMessage content={message.content} />
        <p className="mt-1 text-right text-[10px] text-slate-300/85">
          {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
    </article>
  );
}
