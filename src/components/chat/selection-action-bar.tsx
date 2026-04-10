"use client";

interface SelectionActionBarProps {
  selectedCount: number;
  onClose: () => void;
  onCopy: () => Promise<void>;
  onDelete: () => Promise<void>;
  onConvertToNote: () => Promise<void>;
}

export function SelectionActionBar({
  selectedCount,
  onClose,
  onCopy,
  onDelete,
  onConvertToNote,
}: SelectionActionBarProps) {
  return (
    <div className="rounded-2xl border border-emerald-300/30 bg-emerald-500/10 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-emerald-100">{selectedCount} selected</p>
          <p className="text-[11px] text-emerald-200/90">Multi-select mode</p>
        </div>
        <button
          type="button"
          className="rounded-lg border border-emerald-200/40 px-2 py-1 text-xs font-medium text-emerald-100"
          onClick={onClose}
        >
          Close
        </button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={selectedCount === 0}
          className="rounded-xl border border-noema-borderSoft bg-slate-900/75 px-3 py-2 text-left text-sm text-slate-100 disabled:opacity-50"
          onClick={() => void onCopy()}
        >
          Copy selected
        </button>
        <button
          type="button"
          disabled={selectedCount === 0}
          className="rounded-xl border border-rose-300/25 bg-rose-500/10 px-3 py-2 text-left text-sm text-rose-100 disabled:opacity-50"
          onClick={() => void onDelete()}
        >
          Delete selected
        </button>
        <button
          type="button"
          disabled
          className="rounded-xl border border-noema-borderSoft bg-slate-900/75 px-3 py-2 text-left text-sm text-slate-400"
        >
          Translate selected (Soon)
        </button>
        <button
          type="button"
          disabled={selectedCount === 0}
          className="rounded-xl border border-noema-borderSoft bg-slate-900/75 px-3 py-2 text-left text-sm text-slate-100 disabled:opacity-50"
          onClick={() => void onConvertToNote()}
        >
          Convert to note
        </button>
      </div>
    </div>
  );
}
