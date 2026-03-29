'use client';

import { Icon } from '@iconify/react';

interface MessageMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onCopy: () => void;
  onAskAgent: () => void;
  anchor: { x: number; y: number };
}

export function MessageMenu({ isOpen, onClose, onCopy, onAskAgent, anchor }: MessageMenuProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <>
      <button type="button" className="fixed inset-0 z-20 bg-black/20" onClick={onClose} aria-label="Close menu" />
      <div
        className="fixed z-30 w-52 rounded-2xl border border-noema-stroke bg-[#131c39]/95 p-1 shadow-2xl backdrop-blur-xl"
        style={{ left: `min(${anchor.x}px, calc(100vw - 14rem))`, top: `min(${anchor.y}px, calc(100dvh - 13rem))` }}
      >
        <button
          type="button"
          onClick={onCopy}
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-white/10"
        >
          <Icon icon="solar:copy-linear" className="text-base" /> Copy
        </button>
        <button
          type="button"
          onClick={onAskAgent}
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-white/10"
        >
          <Icon icon="solar:stars-line-duotone" className="text-base" /> Ask Agent
        </button>
        <button
          type="button"
          disabled
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-noema-muted"
          title="Coming soon"
        >
          <Icon icon="solar:global-line-duotone" className="text-base" /> Translate (coming soon)
        </button>
      </div>
    </>
  );
}
