"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@iconify/react";
import { useCalendarStore } from "@/store/calendar-store";

type CalendarHomeView = "agenda" | "day" | "month";

const VIEWS: { key: CalendarHomeView; label: string }[] = [
  { key: "agenda", label: "Agenda" },
  { key: "day", label: "Day" },
  { key: "month", label: "Month" },
];

const startOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate());
const addDays = (value: Date, days: number) => new Date(value.getFullYear(), value.getMonth(), value.getDate() + days);
const addMonths = (value: Date, months: number) => new Date(value.getFullYear(), value.getMonth() + months, 1);

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const formatWhen = (startAt: string, endAt: string, allDay: boolean) => {
  if (allDay) return new Date(startAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  return `${new Date(startAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} → ${new Date(endAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
};

export function CalendarScreen() {
  const { events, hydrated, hydrating, hydrateEvents, createEvent } = useCalendarStore();
  const [activeView, setActiveView] = useState<CalendarHomeView>("agenda");
  const [focusDate, setFocusDate] = useState<Date>(() => new Date());

  useEffect(() => {
    if (!hydrated && !hydrating) {
      void hydrateEvents();
    }
  }, [hydrateEvents, hydrated, hydrating]);

  const sortedEvents = useMemo(
    () =>
      [...events].sort((a, b) => {
        const byPinned = Number(b.isPinned) - Number(a.isPinned);
        if (byPinned !== 0) return byPinned;
        return a.startAt.localeCompare(b.startAt);
      }),
    [events],
  );

  const visibleEvents = useMemo(() => {
    const focusStart = startOfDay(focusDate);
    if (activeView === "agenda") {
      const agendaEnd = addDays(focusStart, 7);
      return sortedEvents.filter((event) => {
        const startsAt = new Date(event.startAt);
        return startsAt >= focusStart && startsAt < agendaEnd;
      });
    }
    if (activeView === "day") {
      return sortedEvents.filter((event) => isSameDay(new Date(event.startAt), focusStart));
    }
    return sortedEvents.filter((event) => {
      const startsAt = new Date(event.startAt);
      return startsAt.getMonth() === focusStart.getMonth() && startsAt.getFullYear() === focusStart.getFullYear();
    });
  }, [activeView, focusDate, sortedEvents]);

  const monthCells = useMemo(() => {
    const monthStart = new Date(focusDate.getFullYear(), focusDate.getMonth(), 1);
    const gridStart = addDays(monthStart, -monthStart.getDay());
    return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  }, [focusDate]);

  const dateContextLabel = useMemo(() => {
    if (activeView === "agenda") {
      const start = startOfDay(focusDate);
      const end = addDays(start, 6);
      return `${start.toLocaleDateString([], { month: "short", day: "numeric" })} – ${end.toLocaleDateString([], { month: "short", day: "numeric" })}`;
    }
    if (activeView === "day") {
      return focusDate.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" });
    }
    return focusDate.toLocaleDateString([], { month: "long", year: "numeric" });
  }, [activeView, focusDate]);

  const shiftDate = (direction: -1 | 1) => {
    setFocusDate((current) => {
      if (activeView === "month") return addMonths(current, direction);
      if (activeView === "day") return addDays(current, direction);
      return addDays(current, direction * 7);
    });
  };

  return (
    <section className="flex h-full min-h-0 flex-col gap-3 pb-16">
      <div className="rounded-2xl border border-noema-border bg-noema-panel p-3 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Calendar</h2>
            <p className="mt-1 text-xs text-slate-400">{dateContextLabel}</p>
          </div>
          <button
            type="button"
            onClick={() => setFocusDate(new Date())}
            className="rounded-md border border-noema-borderSoft px-2 py-1 text-[11px] text-slate-300"
          >
            Today
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="inline-flex items-center gap-1 rounded-lg border border-noema-borderSoft bg-slate-950/60 p-1">
            {VIEWS.map((view) => (
              <button
                key={view.key}
                type="button"
                onClick={() => setActiveView(view.key)}
                className={`rounded-md px-2 py-1 text-xs ${activeView === view.key ? "bg-violet-500/20 text-violet-100" : "text-slate-400"}`}
              >
                {view.label}
              </button>
            ))}
          </div>
          <div className="inline-flex items-center gap-1">
            <button type="button" onClick={() => shiftDate(-1)} className="rounded-md border border-noema-borderSoft px-2 py-1 text-xs text-slate-300">
              <Icon icon="solar:alt-arrow-left-bold" className="text-sm" />
            </button>
            <button type="button" onClick={() => shiftDate(1)} className="rounded-md border border-noema-borderSoft px-2 py-1 text-xs text-slate-300">
              <Icon icon="solar:alt-arrow-right-bold" className="text-sm" />
            </button>
          </div>
        </div>
      </div>

      {activeView === "month" ? (
        <div className="min-h-0 flex-1 rounded-2xl border border-noema-border bg-noema-glassStrong p-2">
          {visibleEvents.length === 0 && (
            <div className="mb-2 rounded-lg border border-dashed border-noema-borderSoft px-2 py-1.5 text-[11px] text-slate-400">
              No events in this month yet.
            </div>
          )}
          <div className="grid grid-cols-7 gap-1 text-[10px] uppercase tracking-wide text-slate-500">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
              <p key={label} className="px-1 py-1 text-center">{label}</p>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {monthCells.map((day) => {
              const count = visibleEvents.filter((event) => isSameDay(new Date(event.startAt), day)).length;
              const inMonth = day.getMonth() === focusDate.getMonth();
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => {
                    setFocusDate(day);
                    setActiveView("day");
                  }}
                  className={`min-h-14 rounded-lg border p-1 text-left ${inMonth ? "border-noema-borderSoft bg-slate-950/55 text-slate-200" : "border-noema-borderSoft/50 bg-slate-950/30 text-slate-500"}`}
                >
                  <p className="text-[10px]">{day.getDate()}</p>
                  {count > 0 && <p className="mt-1 text-[10px] text-violet-200">{count} event{count > 1 ? "s" : ""}</p>}
                </button>
              );
            })}
          </div>
        </div>
      ) : visibleEvents.length === 0 ? (
        <div className="flex min-h-44 flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-noema-borderSoft bg-noema-glassStrong p-4 text-center">
          <p className="text-sm font-medium text-slate-200">No events in this {activeView} view.</p>
          <p className="mt-1 text-xs text-slate-400">Try changing date context or create a new event.</p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-2xl border border-noema-border bg-noema-glassStrong p-2">
          {visibleEvents.map((event) => (
            <article key={event.id} className="rounded-xl border border-noema-borderSoft bg-slate-950/55 p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="line-clamp-1 text-sm font-medium text-slate-100">{event.title}</h3>
                <span className="rounded-full border border-noema-borderSoft px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-300">{event.status}</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">{formatWhen(event.startAt, event.endAt, event.allDay)}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="rounded-full border border-noema-borderSoft px-1.5 py-0.5 text-[10px] text-slate-300">{event.timezone}</span>
                <span className="rounded-full border border-noema-borderSoft px-1.5 py-0.5 text-[10px] text-slate-300">{event.sourceType}</span>
                {event.linkedTaskId && <span className="rounded-full border border-indigo-300/35 px-1.5 py-0.5 text-[10px] text-indigo-200">task #{event.linkedTaskId}</span>}
                {event.linkedDocumentId && <span className="rounded-full border border-cyan-300/35 px-1.5 py-0.5 text-[10px] text-cyan-200">doc #{event.linkedDocumentId}</span>}
              </div>
            </article>
          ))}
        </div>
      )}

      <button
        type="button"
        aria-label="Create calendar event"
        onClick={async () => {
          const now = new Date();
          const end = new Date(now.getTime() + 60 * 60 * 1000);
          await createEvent({
            title: "New calendar event",
            descriptionMarkdown: "",
            startAt: now.toISOString(),
            endAt: end.toISOString(),
            sourceType: "manual",
          });
        }}
        className="absolute bottom-0 right-1 inline-flex h-12 w-12 items-center justify-center rounded-full border border-violet-300/30 bg-violet-500/25 text-violet-100 shadow-glass"
      >
        <Icon icon="solar:add-circle-bold" className="text-2xl" />
      </button>
    </section>
  );
}
