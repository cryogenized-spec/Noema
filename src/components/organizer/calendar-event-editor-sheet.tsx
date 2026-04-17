"use client";

import { useMemo, useState } from "react";
import { Icon } from "@iconify/react";
import { CalendarIntelligenceReviewSheet } from "@/components/organizer/calendar-intelligence-review-sheet";
import { RECURRENCE_PRESETS, recurrenceRuleFromPreset } from "@/lib/calendar/recurrence";
import { useOrganizerReviewQueueStore } from "@/store/organizer-review-queue-store";
import { deriveCalendarReminderState } from "@/lib/calendar/reminders";
import {
  runCalendarIntelligence,
  type CalendarIntelligenceAction,
  type CalendarIntelligenceResult,
} from "@/lib/organizer-intelligence/calendar-intelligence";
import type { OrganizerDraftEnvelope } from "@/lib/organizer-intelligence/types";
import type { CalendarEventRecord, CalendarRecurrencePreset, CreateCalendarEventInput } from "@/types/calendar";

interface CalendarEventEditorSheetProps {
  event: CalendarEventRecord | null;
  allEvents?: CalendarEventRecord[];
  openIntelligenceOnMount?: boolean;
  onClose: () => void;
  onSave: (input: CreateCalendarEventInput, eventId?: number) => Promise<void>;
}

const INTELLIGENCE_ACTIONS: { action: CalendarIntelligenceAction; label: string }[] = [
  { action: "refine_event", label: "Refine title + description" },
  { action: "suggest_timing", label: "Suggest timing" },
  { action: "estimate_duration", label: "Estimate duration" },
  { action: "suggest_reminder", label: "Suggest reminder" },
  { action: "detect_conflicts", label: "Detect conflicts" },
  { action: "suggest_alternate_times", label: "Suggest alternate time" },
];

const toLocalDateTimeInput = (iso?: string) => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const toLocalDateInput = (iso?: string) => toLocalDateTimeInput(iso).slice(0, 10);

const localDateTimeToIso = (value: string) => (value ? new Date(value).toISOString() : "");

const dateToIsoAtMidnight = (value: string) => (value ? new Date(`${value}T00:00:00`).toISOString() : "");
const dateToIsoAtDayEnd = (value: string) => (value ? new Date(`${value}T23:59:59`).toISOString() : "");

export function CalendarEventEditorSheet({ event, allEvents = [], openIntelligenceOnMount = false, onClose, onSave }: CalendarEventEditorSheetProps) {
  const [title, setTitle] = useState(event?.title ?? "");
  const [descriptionMarkdown, setDescriptionMarkdown] = useState(event?.descriptionMarkdown ?? "");
  const [allDay, setAllDay] = useState(event?.allDay ?? false);
  const [startAt, setStartAt] = useState(event?.startAt ?? new Date().toISOString());
  const [endAt, setEndAt] = useState(event?.endAt ?? new Date(Date.now() + 60 * 60 * 1000).toISOString());
  const [timezone, setTimezone] = useState(event?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC");
  const [locationText, setLocationText] = useState(event?.locationText ?? "");
  const [reminderEnabled, setReminderEnabled] = useState(event?.reminderEnabled ?? false);
  const [reminderAt, setReminderAt] = useState(event?.reminderAt ?? "");
  const [reminderNote, setReminderNote] = useState(event?.reminderNote ?? "");
  const [colorTag, setColorTag] = useState(event?.colorTag ?? "");
  const [linkedTaskId, setLinkedTaskId] = useState(event?.linkedTaskId ? String(event.linkedTaskId) : "");
  const [recurrencePreset, setRecurrencePreset] = useState<CalendarRecurrencePreset>(event?.recurrencePreset ?? "none");
  const [recurrenceRule, setRecurrenceRule] = useState(event?.recurrenceRule ?? "");
  const [saving, setSaving] = useState(false);
  const [intelligenceMenuOpen, setIntelligenceMenuOpen] = useState(openIntelligenceOnMount);
  const [intelligenceResult, setIntelligenceResult] = useState<CalendarIntelligenceResult | null>(null);
  const { enqueueDrafts } = useOrganizerReviewQueueStore();

  const validationError = useMemo(() => {
    if (!title.trim()) return "Title is required.";
    if (!startAt || !endAt) return "Start and end are required.";
    if (new Date(endAt).getTime() < new Date(startAt).getTime()) return "End time cannot be before start time.";
    return "";
  }, [endAt, startAt, title]);

  const reminderState = useMemo(
    () => deriveCalendarReminderState({ reminderEnabled, reminderAt, reminderState: event?.reminderState }),
    [event?.reminderState, reminderAt, reminderEnabled],
  );

  const currentDraft = useMemo<CreateCalendarEventInput>(
    () => ({
      title: title.trim(),
      descriptionMarkdown,
      startAt,
      endAt,
      allDay,
      timezone,
      locationText: locationText.trim() || undefined,
      reminderEnabled,
      reminderAt: reminderEnabled ? reminderAt || undefined : undefined,
      reminderState,
      reminderNote: reminderEnabled ? reminderNote.trim() || undefined : undefined,
      colorTag: colorTag.trim() || undefined,
      linkedTaskId: linkedTaskId ? Number(linkedTaskId) || undefined : undefined,
      recurrencePreset,
      recurrenceRule: recurrenceRuleFromPreset(recurrencePreset, recurrenceRule),
      sourceType: event?.sourceType ?? "manual",
      sourceRef: event?.sourceRef,
      status: event?.status,
      linkedDocumentId: event?.linkedDocumentId,
      notes: event?.notes,
      isPinned: event?.isPinned,
    }),
    [
      title,
      descriptionMarkdown,
      startAt,
      endAt,
      allDay,
      timezone,
      locationText,
      reminderEnabled,
      reminderAt,
      reminderState,
      reminderNote,
      colorTag,
      linkedTaskId,
      recurrencePreset,
      recurrenceRule,
      event,
    ],
  );

  const runAction = async (action: CalendarIntelligenceAction) => {
    const pool = allEvents.filter((item) => item.id !== event?.id);
    const result = runCalendarIntelligence(currentDraft, action, pool);
    setIntelligenceResult(result);
    setIntelligenceMenuOpen(false);
    await enqueueDrafts({
      drafts: result.drafts,
      source: "calendar_intelligence",
      sourceLabel: currentDraft.title || "Calendar event",
      sourceRef: event?.id !== undefined ? String(event.id) : undefined,
    });
  };

  const applyDrafts = async (drafts: OrganizerDraftEnvelope[]) => {
    for (const draft of drafts) {
      if (draft.draftType === "event_draft" && "draft" in draft.payload) {
        const next = draft.payload.draft as CreateCalendarEventInput;
        setTitle(next.title ?? title);
        setDescriptionMarkdown(next.descriptionMarkdown ?? "");
        setStartAt(next.startAt ?? startAt);
        setEndAt(next.endAt ?? endAt);
        setAllDay(Boolean(next.allDay));
        setTimezone(next.timezone ?? timezone);
        setLocationText(next.locationText ?? "");
        setReminderEnabled(Boolean(next.reminderEnabled));
        setReminderAt(next.reminderAt ?? "");
        setReminderNote(next.reminderNote ?? "");
        setColorTag(next.colorTag ?? "");
        setLinkedTaskId(next.linkedTaskId ? String(next.linkedTaskId) : "");
        setRecurrencePreset(next.recurrencePreset ?? "none");
        setRecurrenceRule(next.recurrenceRule ?? "");
      }
    }
    setIntelligenceResult(null);
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end bg-black/50" onClick={onClose}>
        <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-noema-border bg-noema-panel p-3 pb-6" onClick={(event) => event.stopPropagation()}>
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-slate-600/80" />
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-100">{event ? "Edit event" : "Create event"}</h3>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setIntelligenceMenuOpen((current) => !current)} className="rounded-md border border-violet-300/35 px-2 py-1 text-xs text-violet-100">
                <span className="inline-flex items-center gap-1"><Icon icon="solar:magic-stick-3-bold" /> Intelligence</span>
              </button>
              <button type="button" onClick={onClose} className="rounded-md border border-noema-borderSoft px-2 py-1 text-xs text-slate-300">
                Close
              </button>
            </div>
          </div>

          {intelligenceMenuOpen && (
            <div className="mb-3 rounded-lg border border-noema-borderSoft bg-slate-950/60 p-2">
              <p className="mb-2 text-[11px] uppercase tracking-wide text-slate-400">Calendar intelligence actions</p>
              <div className="grid grid-cols-2 gap-2">
                {INTELLIGENCE_ACTIONS.map((item) => (
                  <button key={item.action} type="button" onClick={() => void runAction(item.action)} className="rounded-lg border border-noema-borderSoft px-2 py-2 text-left text-xs text-slate-200">
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-xs text-slate-300">
              Title
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Event title"
                className="mt-1 w-full rounded-lg border border-noema-borderSoft bg-slate-950/80 px-3 py-2 text-sm text-slate-100"
              />
            </label>

            <label className="block text-xs text-slate-300">
              Description (markdown)
              <textarea
                value={descriptionMarkdown}
                onChange={(event) => setDescriptionMarkdown(event.target.value)}
                placeholder="Notes in markdown…"
                className="mt-1 h-24 w-full resize-none rounded-lg border border-noema-borderSoft bg-slate-950/80 px-3 py-2 text-sm text-slate-100"
              />
            </label>

            <label className="inline-flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(event) => {
                  const enabled = event.target.checked;
                  setAllDay(enabled);
                  if (enabled) {
                    const startDate = toLocalDateInput(startAt);
                    const endDate = toLocalDateInput(endAt) || startDate;
                    setStartAt(dateToIsoAtMidnight(startDate));
                    setEndAt(dateToIsoAtDayEnd(endDate));
                  }
                }}
              />
              All day
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs text-slate-300">
                Start
                <input
                  type={allDay ? "date" : "datetime-local"}
                  value={allDay ? toLocalDateInput(startAt) : toLocalDateTimeInput(startAt)}
                  onChange={(event) => setStartAt(allDay ? dateToIsoAtMidnight(event.target.value) : localDateTimeToIso(event.target.value))}
                  className="mt-1 w-full rounded-lg border border-noema-borderSoft bg-slate-950/80 px-3 py-2 text-sm text-slate-100"
                />
              </label>
              <label className="block text-xs text-slate-300">
                End
                <input
                  type={allDay ? "date" : "datetime-local"}
                  value={allDay ? toLocalDateInput(endAt) : toLocalDateTimeInput(endAt)}
                  onChange={(event) => setEndAt(allDay ? dateToIsoAtDayEnd(event.target.value) : localDateTimeToIso(event.target.value))}
                  className="mt-1 w-full rounded-lg border border-noema-borderSoft bg-slate-950/80 px-3 py-2 text-sm text-slate-100"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs text-slate-300">
                Timezone
                <input value={timezone} onChange={(event) => setTimezone(event.target.value)} className="mt-1 w-full rounded-lg border border-noema-borderSoft bg-slate-950/80 px-3 py-2 text-sm text-slate-100" />
              </label>
              <label className="block text-xs text-slate-300">
                Color tag
                <input value={colorTag} onChange={(event) => setColorTag(event.target.value)} placeholder="violet / work / #9b7dff" className="mt-1 w-full rounded-lg border border-noema-borderSoft bg-slate-950/80 px-3 py-2 text-sm text-slate-100" />
              </label>
            </div>

            <label className="block text-xs text-slate-300">
              Location
              <input value={locationText} onChange={(event) => setLocationText(event.target.value)} placeholder="Optional location" className="mt-1 w-full rounded-lg border border-noema-borderSoft bg-slate-950/80 px-3 py-2 text-sm text-slate-100" />
            </label>

            <label className="block text-xs text-slate-300">
              Linked task ID (optional)
              <input value={linkedTaskId} onChange={(event) => setLinkedTaskId(event.target.value)} placeholder="e.g. 42" className="mt-1 w-full rounded-lg border border-noema-borderSoft bg-slate-950/80 px-3 py-2 text-sm text-slate-100" />
            </label>

            <div className="rounded-lg border border-noema-borderSoft bg-slate-950/50 p-2">
              <label className="inline-flex items-center gap-2 text-xs text-slate-300">
                <input type="checkbox" checked={reminderEnabled} onChange={(event) => setReminderEnabled(event.target.checked)} />
                Reminder enabled
              </label>
              <label className="mt-2 block text-xs text-slate-300">
                Reminder time
                <input
                  type="datetime-local"
                  disabled={!reminderEnabled}
                  value={toLocalDateTimeInput(reminderAt)}
                  onChange={(event) => setReminderAt(localDateTimeToIso(event.target.value))}
                  className="mt-1 w-full rounded-lg border border-noema-borderSoft bg-slate-950/80 px-3 py-2 text-sm text-slate-100 disabled:opacity-50"
                />
              </label>
              <label className="mt-2 block text-xs text-slate-300">
                Reminder note
                <input
                  disabled={!reminderEnabled}
                  value={reminderNote}
                  onChange={(event) => setReminderNote(event.target.value)}
                  placeholder="Optional reminder note"
                  className="mt-1 w-full rounded-lg border border-noema-borderSoft bg-slate-950/80 px-3 py-2 text-sm text-slate-100 disabled:opacity-50"
                />
              </label>
              <p className="mt-2 text-[11px] text-slate-400">
                State: <span className="text-slate-300">{reminderState}</span>
              </p>
            </div>

            <div className="rounded-lg border border-noema-borderSoft bg-slate-950/50 p-2">
              <label className="block text-xs text-slate-300">
                Recurrence
                <select
                  value={recurrencePreset}
                  onChange={(event) => setRecurrencePreset(event.target.value as CalendarRecurrencePreset)}
                  className="mt-1 w-full rounded-lg border border-noema-borderSoft bg-slate-950/80 px-3 py-2 text-sm text-slate-100"
                >
                  {RECURRENCE_PRESETS.map((preset) => (
                    <option key={preset.value} value={preset.value}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </label>
              {recurrencePreset === "custom" && (
                <label className="mt-2 block text-xs text-slate-300">
                  Custom recurrence rule
                  <input
                    value={recurrenceRule}
                    onChange={(event) => setRecurrenceRule(event.target.value)}
                    placeholder="e.g. FREQ=WEEKLY;BYDAY=MO,WE,FR"
                    className="mt-1 w-full rounded-lg border border-noema-borderSoft bg-slate-950/80 px-3 py-2 text-sm text-slate-100"
                  />
                </label>
              )}
            </div>
          </div>

          {validationError && <p className="mt-3 text-xs text-rose-300">{validationError}</p>}

          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-noema-borderSoft px-3 py-2 text-xs text-slate-300">
              Cancel
            </button>
            <button
              type="button"
              disabled={Boolean(validationError) || saving}
              onClick={async () => {
                if (validationError) return;
                setSaving(true);
                try {
                  await onSave(currentDraft, event?.id);
                  onClose();
                } finally {
                  setSaving(false);
                }
              }}
              className="rounded-lg bg-violet-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save event"}
            </button>
          </div>
        </div>
      </div>

      <CalendarIntelligenceReviewSheet
        visible={Boolean(intelligenceResult)}
        drafts={intelligenceResult?.drafts ?? []}
        onClose={() => setIntelligenceResult(null)}
        onDiscard={() => setIntelligenceResult(null)}
        onAccept={applyDrafts}
      />
    </>
  );
}
