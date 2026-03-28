'use client';

import { useRef, type PointerEvent } from 'react';
import type { ChatMessage } from '@/types/message';
import { MarkdownMessage } from '@/components/chat/markdown-message';

interface MessageBubbleProps {
  message: ChatMessage;
  onLongPress: (message: ChatMessage, coordinates: { x: number; y: number }) => void;
}

const bubbleClass = {
  user: 'bg-indigo-400/15 border-indigo-300/30 ml-8',
  agent: 'bg-violet-400/15 border-violet-300/30 mr-8',
  system: 'bg-slate-400/10 border-slate-300/20 mr-8',
};

export function MessageBubble({ message, onLongPress }: MessageBubbleProps) {
  const timerRef = useRef<number | undefined>(undefined);

  const startPress = (event: PointerEvent<HTMLButtonElement>) => {
    const x = event.clientX;
    const y = event.clientY;

    timerRef.current = window.setTimeout(() => {
      onLongPress(message, { x, y });
    }, 420);
  };

  const stopPress = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }
  };

  return (
    <button
      type="button"
      onPointerDown={startPress}
      onPointerUp={stopPress}
      onPointerCancel={stopPress}
      onContextMenu={(event) => {
        event.preventDefault();
        onLongPress(message, { x: event.clientX, y: event.clientY });
      }}
      className={`w-full rounded-2xl border px-3 py-2 text-left shadow-sm backdrop-blur-sm ${bubbleClass[message.role]}`}
    >
      <MarkdownMessage content={message.content} />
      <p className="mt-2 text-right text-[10px] uppercase tracking-wide text-noema-muted">
        {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </p>
    </button>
  );
}
