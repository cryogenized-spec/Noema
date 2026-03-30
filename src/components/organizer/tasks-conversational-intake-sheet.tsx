"use client";

import { useMemo, useState } from "react";
import type { GuidedClarification, GuidedIntakeDraft } from "@/lib/tasks/guided-intake";

interface TasksConversationalIntakeSheetProps {
  draft: GuidedIntakeDraft;
  clarifications: GuidedClarification[];
  onCancel: () => void;
  onSwitchToManualEdit: (draft: GuidedIntakeDraft, includeSubtasks: boolean) => void;
  onSave: (draft: GuidedIntakeDraft, includeSubtasks: boolean) => Promise<void>;
}

interface ConversationLine {
  role: "assistant" | "user";
  text: string;
}

const parseDueAt = (answer: string): string | undefined => {
  const trimmed = answer.trim();
  if (!trimmed) return undefined;
  const direct = Date.parse(trimmed);
  if (!Number.isNaN(direct)) return new Date(direct).toISOString();

  if (/tomorrow/i.test(trimmed)) {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    date.setHours(9, 0, 0, 0);
    return date.toISOString();
  }
  if (/tonight/i.test(trimmed)) {
    const date = new Date();
    date.setHours(20, 0, 0, 0);
    return date.toISOString();
  }
  return undefined;
};

const parseDurationMinutes = (answer: string): number | undefined => {
  const minuteMatch = answer.match(/(\d{1,3})\s*(m|min|mins|minutes)?/i);
  if (!minuteMatch) return undefined;
  return Number(minuteMatch[1]);
};

export function TasksConversationalIntakeSheet({
  draft,
  clarifications,
  onCancel,
  onSwitchToManualEdit,
  onSave,
}: TasksConversationalIntakeSheetProps) {
  const [workingDraft, setWorkingDraft] = useState<GuidedIntakeDraft>(draft);
  const [pendingClarifications, setPendingClarifications] = useState<GuidedClarification[]>(clarifications);
  const [conversation, setConversation] = useState<ConversationLine[]>([
    {
      role: "assistant",
      text: `Got it — I drafted "${draft.title}". I’ll ask a couple quick task-focused questions to finalize it.`,
    },
    ...(clarifications[0] ? [{ role: "assistant" as const, text: clarifications[0].question }] : []),
  ]);
  const [draftAnswer, setDraftAnswer] = useState("");
  const [includeSubtasks, setIncludeSubtasks] = useState(draft.suggestedSubtasks.length > 0);
  const [saving, setSaving] = useState(false);

  const currentQuestion = pendingClarifications[0] ?? null;
  const completed = pendingClarifications.length === 0;

  const applyAnswer = (answerRaw: string) => {
    const answer = answerRaw.trim();
    if (!currentQuestion) return;

    setConversation((current) => [...current, { role: "user", text: answer || "Skip" }]);

    setWorkingDraft((current) => {
      const next = { ...current };
      if (currentQuestion.id === "due_time") {
        next.dueAt = parseDueAt(answer) ?? current.dueAt;
      } else if (currentQuestion.id === "duration") {
        next.estimatedDurationMinutes = parseDurationMinutes(answer) ?? current.estimatedDurationMinutes;
      } else if (currentQuestion.id === "priority") {
        if (/urgent/i.test(answer)) next.priority = "urgent";
        else if (/high/i.test(answer)) next.priority = "high";
        else if (/low/i.test(answer)) next.priority = "low";
        else if (/normal/i.test(answer)) next.priority = "normal";
      } else if (currentQuestion.id === "subtasks") {
        if (/no|skip|not now/i.test(answer)) setIncludeSubtasks(false);
        if (/yes|sure|ok|generate/i.test(answer)) setIncludeSubtasks(true);
      }
      return next;
    });

    setPendingClarifications((current) => {
      const next = current.slice(1);
      if (next[0]) {
        setConversation((lines) => [...lines, { role: "assistant", text: next[0].question }]);
      } else {
        setConversation((lines) => [
          ...lines,
          { role: "assistant", text: "All set. Review below, then save or switch to manual edit." },
        ]);
      }
      return next;
    });
    setDraftAnswer("");
  };

  const summaryLines = useMemo(
    () => [
      `Title: ${workingDraft.title}`,
      `Priority: ${workingDraft.priority}`,
      `Status: ${workingDraft.status}`,
      `Due: ${workingDraft.dueAt ? new Date(workingDraft.dueAt).toLocaleString() : "Not set"}`,
      `Duration: ${workingDraft.estimatedDurationMinutes ? `${workingDraft.estimatedDurationMinutes} min` : "Not set"}`,
      `Subtasks: ${includeSubtasks ? workingDraft.suggestedSubtasks.length : 0}`,
    ],
    [workingDraft, includeSubtasks],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/45" onClick={onCancel}>
      <div className="max-h-[88dvh] w-full overflow-y-auto rounded-t-2xl border border-noema-border bg-noema-panel p-3 pb-6 shadow-glass" onClick={(event) => event.stopPropagation()}>
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-slate-600/80" />
        <div className="mb-2 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-100">Conversational intake</p>
            <p className="text-xs text-slate-400">Focused task assistant flow</p>
          </div>
          <button type="button" onClick={onCancel} className="rounded-md border border-noema-borderSoft px-2 py-1 text-[11px] text-slate-300">
            Exit
          </button>
        </div>

        <div className="mb-2 max-h-48 space-y-1 overflow-y-auto rounded-xl border border-noema-borderSoft bg-slate-950/60 p-2">
          {conversation.map((line, index) => (
            <div key={index} className={`max-w-[92%] rounded-lg px-2 py-1.5 text-xs ${line.role === "assistant" ? "border border-noema-borderSoft bg-slate-900/70 text-slate-200" : "ml-auto border border-violet-300/30 bg-violet-500/18 text-violet-100"}`}>
              {line.text}
            </div>
          ))}
        </div>

        {!completed && (
          <div className="mb-3 flex gap-2">
            <input
              value={draftAnswer}
              onChange={(event) => setDraftAnswer(event.target.value)}
              placeholder={currentQuestion?.helpText ?? "Type answer or skip"}
              className="w-full rounded-lg border border-noema-borderSoft bg-slate-950/75 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none"
            />
            <button type="button" onClick={() => applyAnswer(draftAnswer)} className="rounded-lg border border-violet-300/35 bg-violet-500/20 px-3 py-2 text-xs text-violet-100">
              Send
            </button>
          </div>
        )}

        <div className="rounded-xl border border-noema-borderSoft bg-slate-950/70 p-2 text-xs text-slate-300">
          <p className="mb-1 font-medium text-slate-200">Draft summary</p>
          {summaryLines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onSwitchToManualEdit(workingDraft, includeSubtasks)}
            className="rounded-lg border border-noema-borderSoft px-3 py-2 text-xs text-slate-300"
          >
            Switch to manual edit
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setSaving(true);
              void onSave(workingDraft, includeSubtasks).finally(() => setSaving(false));
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

