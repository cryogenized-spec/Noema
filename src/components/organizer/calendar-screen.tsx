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

const formatTimeRange = (startAt: string, endAt: string, allDay: boolean) => {
  if (allDay) return "All day";
  return `${new Date(startAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} – ${new Date(endAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
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

  const agendaGroups = useMemo(() => {
    if (activeView !== "agenda") return [];
    const groups = new Map<string, typeof visibleEvents>();
    for (const event of visibleEvents) {
      const dayKey = startOfDay(new Date(event.startAt)).toISOString();
      const current = groups.get(dayKey) ?? [];
      groups.set(dayKey, [...current, event]);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dayKey, dayEvents]) => ({
        day: new Date(dayKey),
        events: [...dayEvents].sort((a, b) => a.startAt.localeCompare(b.startAt)),
      }));
  }, [activeView, visibleEvents]);

  const dayAllDayEvents = useMemo(
    () => (activeView === "day" ? visibleEvents.filter((event) => event.allDay) : []),
    [activeView, visibleEvents],
  );
  const dayTimedEvents = useMemo(
    () => (activeView === "day" ? visibleEvents.filter((event) => !event.allDay).sort((a, b) => a.startAt.localeCompare(b.startAt)) : []),
    [activeView, visibleEvents],
  );
  const monthSelectedDayEvents = useMemo(
    () => (activeView === "month" ? visibleEvents.filter((event) => isSameDay(new Date(event.startAt), focusDate)).sort((a, b) => a.startAt.localeCompare(b.startAt)) : []),
    [activeView, focusDate, visibleEvents],
  );

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
              const isTodayCell = isSameDay(day, new Date());
              const isSelectedCell = isSameDay(day, focusDate);
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => {
                    setFocusDate(day);
                  }}
                  className={`min-h-14 rounded-lg border p-1 text-left ${
                    isSelectedCell
                      ? "border-violet-300/45 bg-violet-500/15 text-violet-100"
                      : inMonth
                        ? "border-noema-borderSoft bg-slate-950/55 text-slate-200"
                        : "border-noema-borderSoft/50 bg-slate-950/30 text-slate-500"
                  }`}
                >
                  <p className={`text-[10px] ${isTodayCell ? "font-semibold text-cyan-200" : ""}`}>{day.getDate()}</p>
                  <div className="mt-1 flex items-center gap-1">
                    {count > 0 && <span className="h-1.5 w-1.5 rounded-full bg-violet-300/90" />}
                    {count > 1 && <span className="text-[10px] text-violet-200">{count}</span>}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="mt-2 rounded-xl border border-noema-borderSoft bg-slate-950/50 p-2">
            <p className="text-xs font-semibold text-slate-200">
              {focusDate.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
            </p>
            {monthSelectedDayEvents.length === 0 ? (
              <p className="mt-1 text-[11px] text-slate-400">No events for selected day.</p>
            ) : (
              <div className="mt-1.5 space-y-1.5">
                {monthSelectedDayEvents.map((event) => (
                  <article key={event.id} className="rounded-lg border border-noema-borderSoft bg-slate-950/65 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="line-clamp-1 text-xs font-medium text-slate-100">{event.title}</h3>
                      {event.colorTag && <span className="rounded-full border border-noema-borderSoft px-1.5 py-0.5 text-[10px] text-slate-200">{event.colorTag}</span>}
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-300">{formatTimeRange(event.startAt, event.endAt, event.allDay)}</p>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : visibleEvents.length === 0 ? (
        <div className="flex min-h-44 flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-noema-borderSoft bg-noema-glassStrong p-4 text-center">
          <p className="text-sm font-medium text-slate-200">No events in this {activeView} view.</p>
          <p className="mt-1 text-xs text-slate-400">Try changing date context or create a new event.</p>
        </div>
      ) : activeView === "agenda" ? (
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-2xl border border-noema-border bg-noema-glassStrong p-2">
          {agendaGroups.map((group) => (
            <section key={group.day.toISOString()} className="rounded-xl border border-noema-borderSoft bg-slate-950/40 p-2">
              <p className="mb-2 text-xs font-semibold text-slate-300">
                {group.day.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
              </p>
              <div className="space-y-2">
                {group.events.map((event) => (
                  <article key={event.id} className="rounded-lg border border-noema-borderSoft bg-slate-950/65 p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="line-clamp-1 text-sm font-medium text-slate-100">{event.title}</h3>
                      <span className="rounded-full border border-noema-borderSoft px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-300">{event.status}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-300">{formatTimeRange(event.startAt, event.endAt, event.allDay)}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px]">
                      {event.locationText && <span className="rounded-full border border-noema-borderSoft px-1.5 py-0.5 text-slate-300">📍 {event.locationText}</span>}
                      {event.linkedTaskId && <span className="rounded-full border border-indigo-300/35 px-1.5 py-0.5 text-indigo-200">Task linked</span>}
                      {event.reminderEnabled && <span className="rounded-full border border-cyan-300/35 px-1.5 py-0.5 text-cyan-200">Reminder</span>}
                      {event.colorTag && <span className="rounded-full border border-noema-borderSoft px-1.5 py-0.5 text-slate-200">{event.colorTag}</span>}
                      <span className="rounded-full border border-noema-borderSoft px-1.5 py-0.5 text-slate-300">{event.allDay ? "All day" : event.timezone}</span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : activeView === "day" ? (
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-2xl border border-noema-border bg-noema-glassStrong p-2">
          {dayAllDayEvents.length > 0 && (
            <section className="rounded-xl border border-noema-borderSoft bg-slate-950/40 p-2">
              <p className="mb-2 text-xs font-semibold text-slate-300">All-day</p>
              <div className="space-y-1.5">
                {dayAllDayEvents.map((event) => (
                  <article key={event.id} className="rounded-lg border border-noema-borderSoft bg-slate-950/65 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="line-clamp-1 text-sm font-medium text-slate-100">{event.title}</h3>
                      {event.colorTag && <span className="rounded-full border border-noema-borderSoft px-1.5 py-0.5 text-[10px] text-slate-200">{event.colorTag}</span>}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px]">
                      {event.locationText && <span className="rounded-full border border-noema-borderSoft px-1.5 py-0.5 text-slate-300">📍 {event.locationText}</span>}
                      {event.linkedTaskId && <span className="rounded-full border border-indigo-300/35 px-1.5 py-0.5 text-indigo-200">Task linked</span>}
                      {event.reminderEnabled && <span className="rounded-full border border-cyan-300/35 px-1.5 py-0.5 text-cyan-200">Reminder</span>}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
          {dayTimedEvents.length > 0 ? (
            <section className="rounded-xl border border-noema-borderSoft bg-slate-950/40 p-2">
              <p className="mb-2 text-xs font-semibold text-slate-300">Timeline</p>
              <div className="space-y-2">
                {dayTimedEvents.map((event) => (
                  <article key={event.id} className="grid grid-cols-[56px_1fr] gap-2">
                    <div className="pt-1 text-right text-[11px] text-slate-400">
                      {new Date(event.startAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                    <div className="rounded-lg border border-noema-borderSoft bg-slate-950/65 p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="line-clamp-1 text-sm font-medium text-slate-100">{event.title}</h3>
                        {event.colorTag && <span className="rounded-full border border-noema-borderSoft px-1.5 py-0.5 text-[10px] text-slate-200">{event.colorTag}</span>}
                      </div>
                      <p className="mt-1 text-[11px] text-slate-300">{formatTimeRange(event.startAt, event.endAt, event.allDay)}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px]">
                        {event.locationText && <span className="rounded-full border border-noema-borderSoft px-1.5 py-0.5 text-slate-300">📍 {event.locationText}</span>}
                        {event.linkedTaskId && <span className="rounded-full border border-indigo-300/35 px-1.5 py-0.5 text-indigo-200">Task linked</span>}
                        {event.reminderEnabled && <span className="rounded-full border border-cyan-300/35 px-1.5 py-0.5 text-cyan-200">Reminder</span>}
                        <span className="rounded-full border border-noema-borderSoft px-1.5 py-0.5 text-slate-300">{event.timezone}</span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : (
            <div className="rounded-xl border border-dashed border-noema-borderSoft bg-slate-950/35 p-3 text-center text-xs text-slate-400">
              No timed events for this day.
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-noema-borderSoft bg-slate-950/35 p-3 text-center text-xs text-slate-400">
          Unsupported view.
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
