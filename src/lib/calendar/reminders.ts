import type { CalendarEventRecord, CalendarReminderState } from "@/types/calendar";

interface ReminderStateInput {
  reminderEnabled?: boolean;
  reminderAt?: string;
  reminderState?: CalendarReminderState;
}

export const deriveCalendarReminderState = ({
  reminderEnabled,
  reminderAt,
  reminderState,
}: ReminderStateInput): CalendarReminderState => {
  if (!reminderEnabled) return "disabled";
  if (reminderState === "sent" || reminderState === "failed") return reminderState;
  if (!reminderAt) return "scheduled";

  const reminderTime = new Date(reminderAt).getTime();
  if (Number.isNaN(reminderTime)) return "scheduled";
  return reminderTime <= Date.now() ? "due" : "scheduled";
};

export const collectCalendarReminderCandidates = (events: CalendarEventRecord[], now = new Date()) => {
  const nowTime = now.getTime();
  return events.filter((event) => {
    if (!event.reminderEnabled || !event.reminderAt) return false;
    if (event.status === "archived" || event.status === "cancelled") return false;
    if (event.reminderState === "sent") return false;

    const reminderTime = new Date(event.reminderAt).getTime();
    return !Number.isNaN(reminderTime) && reminderTime <= nowTime;
  });
};
