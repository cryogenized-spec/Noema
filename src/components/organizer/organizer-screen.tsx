"use client";

import { useEffect, useState } from "react";
import { CalendarScreen } from "@/components/organizer/calendar-screen";
import { DocumentsListScreen } from "@/components/organizer/documents-list-screen";
import { OrganizerReviewInboxSheet } from "@/components/organizer/organizer-review-inbox-sheet";
import { TasksListScreen } from "@/components/organizer/tasks-list-screen";
import { useOrganizerReviewQueueStore } from "@/store/organizer-review-queue-store";
import type { OrganizerModule } from "@/types/organizer";

const modules: OrganizerModule[] = ["documents", "tasks", "calendar"];

const labels: Record<OrganizerModule, string> = {
  documents: "Documents",
  tasks: "Tasks",
  calendar: "Calendar",
};

export function OrganizerScreen() {
  const [activeModule, setActiveModule] = useState<OrganizerModule>("documents");
  const [reviewOpen, setReviewOpen] = useState(false);
  const { hydrate, pendingCount } = useOrganizerReviewQueueStore();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const pending = pendingCount();

  return (
    <section className="flex h-full min-h-0 flex-col gap-3">
      <div className="rounded-2xl border border-noema-border bg-noema-glassStrong p-1 backdrop-blur-xl">
        <div className="mb-1 flex items-center justify-end px-1">
          <button type="button" onClick={() => setReviewOpen(true)} className="rounded-lg border border-noema-borderSoft px-2 py-1 text-xs text-slate-200">
            Review {pending > 0 ? `(${pending})` : ""}
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {modules.map((module) => {
            const active = module === activeModule;
            return (
              <button
                key={module}
                type="button"
                onClick={() => setActiveModule(module)}
                className={`rounded-xl px-2 py-2 text-xs font-medium transition ${
                  active ? "bg-violet-500/20 text-violet-100" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                }`}
              >
                {labels[module]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {activeModule === "documents" ? (
          <DocumentsListScreen />
        ) : activeModule === "tasks" ? (
          <TasksListScreen />
        ) : (
          <CalendarScreen />
        )}
      </div>

      <OrganizerReviewInboxSheet visible={reviewOpen} onClose={() => setReviewOpen(false)} />
    </section>
  );
}
