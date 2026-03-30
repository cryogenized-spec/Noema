"use client";

import { create } from "zustand";
import { db } from "@/lib/db/client";
import { createCalendarEventRecord } from "@/lib/calendar/contract";
import { normalizeMarkdownSource } from "@/lib/markdown/contract";
import type { CalendarEventRecord, CreateCalendarEventInput } from "@/types/calendar";

const sortEvents = (events: CalendarEventRecord[]) =>
  [...events].sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || a.startAt.localeCompare(b.startAt));

interface CalendarState {
  events: CalendarEventRecord[];
  hydrated: boolean;
  hydrating: boolean;
  hydrateEvents: () => Promise<void>;
  createEvent: (input: CreateCalendarEventInput) => Promise<CalendarEventRecord>;
  updateEvent: (id: number, patch: Partial<CreateCalendarEventInput>) => Promise<void>;
  deleteEvent: (id: number) => Promise<void>;
}

export const useCalendarStore = create<CalendarState>((set, get) => ({
  events: [],
  hydrated: false,
  hydrating: false,
  hydrateEvents: async () => {
    if (get().hydrating || get().hydrated) return;
    set({ hydrating: true });
    try {
      const events = await db.calendarEvents.toArray();
      set({ events: sortEvents(events), hydrated: true });
    } finally {
      set({ hydrating: false });
    }
  },
  createEvent: async (input) => {
    const record = createCalendarEventRecord(input);
    const id = await db.calendarEvents.add(record);
    const persisted = { ...record, id };
    set((state) => ({ events: sortEvents([...state.events, persisted]) }));
    return persisted;
  },
  updateEvent: async (id, patch) => {
    const current = get().events.find((event) => event.id === id);
    if (!current) return;
    const updatedAt = new Date().toISOString();
    const next: Omit<CalendarEventRecord, "id" | "createdAt"> & { updatedAt: string } = {
      title: patch.title?.trim() ?? current.title,
      descriptionMarkdown:
        patch.descriptionMarkdown !== undefined ? normalizeMarkdownSource(patch.descriptionMarkdown) : current.descriptionMarkdown,
      startAt: patch.startAt ?? current.startAt,
      endAt: patch.endAt ?? current.endAt,
      allDay: patch.allDay ?? current.allDay,
      timezone: patch.timezone ?? current.timezone,
      locationText: patch.locationText ?? current.locationText,
      notes: patch.notes ?? current.notes,
      status: patch.status ?? current.status,
      colorTag: patch.colorTag ?? current.colorTag,
      linkedTaskId: patch.linkedTaskId ?? current.linkedTaskId,
      linkedDocumentId: patch.linkedDocumentId ?? current.linkedDocumentId,
      sourceType: patch.sourceType ?? current.sourceType,
      sourceRef: patch.sourceRef ?? current.sourceRef,
      reminderEnabled: patch.reminderEnabled ?? current.reminderEnabled,
      reminderAt: patch.reminderAt ?? current.reminderAt,
      recurrenceRule: patch.recurrenceRule ?? current.recurrenceRule,
      isPinned: patch.isPinned ?? current.isPinned,
      updatedAt,
    };
    await db.calendarEvents.update(id, next);
    set((state) => ({ events: sortEvents(state.events.map((event) => (event.id === id ? { ...event, ...next } : event))) }));
  },
  deleteEvent: async (id) => {
    await db.calendarEvents.delete(id);
    set((state) => ({ events: state.events.filter((event) => event.id !== id) }));
  },
}));
