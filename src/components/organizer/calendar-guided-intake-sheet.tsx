"use client";

import { useMemo, useState } from "react";
import type { GuidedEventClarification, GuidedEventDraft } from "@/lib/calendar/guided-intake";

interface CalendarGuidedIntakeSheetProps {
  draft: GuidedEventDraft;
  clarifications: GuidedEventClarification[];
  onCancel: () => void;
  onSave: (draft: GuidedEventDraft) => Promise<void>;
}

const toDateTimeLocalInput = (iso?: string) => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

export function CalendarGuidedIntakeSheet({ draft, clarifications, onCancel, onSave }: CalendarGuidedIntakeSheetProps) {
  const [workingDraft, setWorkingDraft] = useState<GuidedEventDraft>(draft);
  const [saving, setSaving] = useState(false);
  const clarificationIds = useMemo(() => new Set(clarifications.map((item) => item.id)), [clarifications]);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/45" onClick={onCancel}>
      <div className="max-h-[88dvh] w-full overflow-y-auto rounded-t-2xl border border-noema-border bg-noema-panel p-3 pb-6 shadow-glass" onClick={(event) => event.stopPropagation()}>
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-slate-600/80" />
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-slate-100">Guided event draft</p>
            <p className="text-xs text-slate-400">Review and tweak before saving.</p>
          </div>
          <button type="button" onClick={onCancel} className="rounded-md border border-noema-borderSoft px-2 py-1 text-[11px] text-slate-300">
            Discard
          </button>
        </div>

        {clarifications.length > 0 && (
          <div className="mb-3 rounded-xl border border-noema-borderSoft bg-slate-950/70 p-2">
            <p className="text-[11px] font-medium text-slate-200">Clarifications</p>
            <div className="mt-1 space-y-1.5">
              {clarifications.map((clarification, index) => (
                <div key={`${clarification.id}-${index}`} className="rounded-lg border border-noema-borderSoft bg-slate-900/60 p-2">
                  <p className="text-xs text-slate-100">{clarification.question}</p>
                  {clarification.helpText && <p className="mt-0.5 text-[11px] text-slate-400">{clarification.helpText}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <input
            value={workingDraft.title}
            onChange={(event) => setWorkingDraft((current) => ({ ...current, title: event.target.value }))}
            placeholder="Event title"
            className="w-full rounded-xl border border-noema-borderSoft bg-slate-950/75 px-3 py-2 text-sm font-medium text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />

          <textarea
            value={workingDraft.descriptionMarkdown}
            onChange={(event) => setWorkingDraft((current) => ({ ...current, descriptionMarkdown: event.target.value }))}
            placeholder="Description"
            className="h-24 w-full resize-none rounded-xl border border-noema-borderSoft bg-slate-950/75 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />

          <div className="grid grid-cols-2 gap-2">
            <input
              type="datetime-local"
              value={toDateTimeLocalInput(workingDraft.startAt)}
              onChange={(event) =>
                setWorkingDraft((current) => ({ ...current, startAt: event.target.value ? new Date(event.target.value).toISOString() : current.startAt }))
              }
              className={`w-full rounded-lg border bg-slate-950/75 px-3 py-2 text-xs text-slate-200 focus:outline-none ${clarificationIds.has("start_time") ? "border-cyan-300/35" : "border-noema-borderSoft"}`}
            />
            <input
              type="datetime-local"
              value={toDateTimeLocalInput(workingDraft.endAt)}
              onChange={(event) =>
                setWorkingDraft((current) => ({ ...current, endAt: event.target.value ? new Date(event.target.value).toISOString() : current.endAt }))
              }
              className={`w-full rounded-lg border bg-slate-950/75 px-3 py-2 text-xs text-slate-200 focus:outline-none ${clarificationIds.has("duration") ? "border-cyan-300/35" : "border-noema-borderSoft"}`}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="inline-flex items-center gap-2 rounded-lg border border-noema-borderSoft bg-slate-950/75 px-3 py-2 text-xs text-slate-200">
              <input
                type="checkbox"
                checked={workingDraft.allDay ?? false}
                onChange={(event) => setWorkingDraft((current) => ({ ...current, allDay: event.target.checked }))}
              />
              All day
            </label>
            <input
              value={workingDraft.locationText ?? ""}
              onChange={(event) => setWorkingDraft((current) => ({ ...current, locationText: event.target.value || undefined }))}
              placeholder="Location"
              className={`w-full rounded-lg border bg-slate-950/75 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none ${clarificationIds.has("location") ? "border-cyan-300/35" : "border-noema-borderSoft"}`}
            />
          </div>

          <label className="inline-flex items-center gap-2 rounded-lg border border-noema-borderSoft bg-slate-950/75 px-3 py-2 text-xs text-slate-200">
            <input
              type="checkbox"
              checked={workingDraft.reminderEnabled ?? false}
              onChange={(event) => setWorkingDraft((current) => ({ ...current, reminderEnabled: event.target.checked }))}
            />
            Reminder enabled
          </label>

          {workingDraft.scheduleAwarenessNote && (
            <p className="rounded-lg border border-amber-300/35 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
              {workingDraft.scheduleAwarenessNote}
            </p>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-noema-borderSoft px-3 py-2 text-xs text-slate-300">
            Discard
          </button>
          <button
            type="button"
            disabled={saving || !workingDraft.title.trim()}
            onClick={() => {
              setSaving(true);
              void onSave(workingDraft).finally(() => setSaving(false));
            }}
            className="rounded-lg border border-violet-300/35 bg-violet-500/20 px-3 py-2 text-xs font-medium text-violet-100 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Confirm & save"}
          </button>
        </div>
      </div>
    </div>
  );
}
