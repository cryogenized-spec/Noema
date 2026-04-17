"use client";

import { useEffect, useMemo, useState } from "react";
import type { OrganizerDraftEnvelope } from "@/lib/organizer-intelligence/types";
import type { CreateCalendarEventInput } from "@/types/calendar";

interface CalendarIntelligenceReviewSheetProps {
  visible: boolean;
  drafts: OrganizerDraftEnvelope[];
  busy?: boolean;
  onClose: () => void;
  onDiscard: () => void;
  onAccept: (drafts: OrganizerDraftEnvelope[]) => Promise<void>;
}

const toLocalDateTimeInput = (iso?: string) => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

export function CalendarIntelligenceReviewSheet({
  visible,
  drafts,
  busy = false,
  onClose,
  onDiscard,
  onAccept,
}: CalendarIntelligenceReviewSheetProps) {
  const [enabled, setEnabled] = useState<boolean[]>([]);
  const [eventDraftEdits, setEventDraftEdits] = useState<Record<string, CreateCalendarEventInput>>({});

  useEffect(() => {
    if (!visible) return;
    setEnabled(drafts.map(() => true));
    const next: Record<string, CreateCalendarEventInput> = {};
    for (const draft of drafts) {
      if (draft.draftType === "event_draft" && "draft" in draft.payload) {
        next[draft.id] = draft.payload.draft as CreateCalendarEventInput;
      }
    }
    setEventDraftEdits(next);
  }, [drafts, visible]);

  const effectiveDrafts = useMemo(
    () =>
      drafts
        .map((draft, index) => ({ draft, index }))
        .filter(({ index }) => enabled[index])
        .map(({ draft }) => {
          if (draft.draftType === "event_draft" && "draft" in draft.payload && eventDraftEdits[draft.id]) {
            return {
              ...draft,
              payload: {
                draft: eventDraftEdits[draft.id],
              },
            } as OrganizerDraftEnvelope;
          }
          return draft;
        }),
    [drafts, enabled, eventDraftEdits],
  );

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50" onClick={onClose}>
      <section
        className="w-full max-h-[84vh] overflow-y-auto rounded-t-3xl border border-noema-border bg-[#10172d]/98 px-4 pb-6 pt-3"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-slate-500/80" />
        <h3 className="text-sm font-semibold text-slate-100">Calendar intelligence review</h3>
        <p className="mb-3 text-xs text-slate-400">Review drafts before applying changes.</p>

        <div className="space-y-2">
          {drafts.map((draft, index) => (
            <article key={draft.id} className="rounded-xl border border-noema-borderSoft bg-slate-900/75 p-3 text-xs text-slate-200">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-400">{draft.draftType.replace(/_/g, " ")}</p>
                <label className="inline-flex items-center gap-1 text-[11px] text-slate-300">
                  <input
                    type="checkbox"
                    checked={enabled[index] ?? true}
                    onChange={(event) => setEnabled((current) => current.map((item, itemIndex) => (itemIndex === index ? event.target.checked : item)))}
                  />
                  apply
                </label>
              </div>

              {draft.draftType === "event_draft" && "draft" in draft.payload && eventDraftEdits[draft.id] && (
                <div className="space-y-2">
                  <input
                    value={eventDraftEdits[draft.id].title ?? ""}
                    onChange={(event) =>
                      setEventDraftEdits((current) => ({
                        ...current,
                        [draft.id]: {
                          ...current[draft.id],
                          title: event.target.value,
                        },
                      }))
                    }
                    className="w-full rounded-lg border border-noema-borderSoft bg-slate-950/75 px-2 py-1.5 text-xs text-slate-100"
                  />
                  <textarea
                    rows={2}
                    value={eventDraftEdits[draft.id].descriptionMarkdown ?? ""}
                    onChange={(event) =>
                      setEventDraftEdits((current) => ({
                        ...current,
                        [draft.id]: {
                          ...current[draft.id],
                          descriptionMarkdown: event.target.value,
                        },
                      }))
                    }
                    className="w-full rounded-lg border border-noema-borderSoft bg-slate-950/75 px-2 py-1.5 text-xs text-slate-100"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="datetime-local"
                      value={toLocalDateTimeInput(eventDraftEdits[draft.id].startAt)}
                      onChange={(event) =>
                        setEventDraftEdits((current) => ({
                          ...current,
                          [draft.id]: {
                            ...current[draft.id],
                            startAt: event.target.value ? new Date(event.target.value).toISOString() : current[draft.id].startAt,
                          },
                        }))
                      }
                      className="rounded-lg border border-noema-borderSoft bg-slate-950/75 px-2 py-1.5 text-xs text-slate-100"
                    />
                    <input
                      type="datetime-local"
                      value={toLocalDateTimeInput(eventDraftEdits[draft.id].endAt)}
                      onChange={(event) =>
                        setEventDraftEdits((current) => ({
                          ...current,
                          [draft.id]: {
                            ...current[draft.id],
                            endAt: event.target.value ? new Date(event.target.value).toISOString() : current[draft.id].endAt,
                          },
                        }))
                      }
                      className="rounded-lg border border-noema-borderSoft bg-slate-950/75 px-2 py-1.5 text-xs text-slate-100"
                    />
                  </div>
                </div>
              )}

              {draft.draftType === "metadata_suggestion_draft" && "suggestions" in draft.payload && (
                <p className="text-xs text-slate-300">{draft.payload.suggestions.note ?? "Metadata suggestion"}</p>
              )}
            </article>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <button type="button" className="rounded-xl border border-noema-borderSoft bg-slate-900/80 px-3 py-2 text-sm text-slate-200" onClick={onDiscard}>
            Discard
          </button>
          <button type="button" className="rounded-xl border border-noema-borderSoft bg-slate-900/80 px-3 py-2 text-sm text-slate-200" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            disabled={busy || effectiveDrafts.length === 0}
            className="rounded-xl bg-violet-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            onClick={() => void onAccept(effectiveDrafts)}
          >
            {busy ? "Applying..." : "Accept selected"}
          </button>
        </div>
      </section>
    </div>
  );
}
