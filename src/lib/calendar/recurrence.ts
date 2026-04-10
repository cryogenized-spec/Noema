import type { CalendarEventRecord, CalendarRecurrencePreset } from "@/types/calendar";

export const RECURRENCE_PRESETS: { value: CalendarRecurrencePreset; label: string }[] = [
  { value: "none", label: "Does not repeat" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "custom", label: "Custom (rule)" },
];

export const recurrenceRuleFromPreset = (
  preset: CalendarRecurrencePreset,
  existingRule?: string,
): string | undefined => {
  if (preset === "none") return undefined;
  if (preset === "daily") return "FREQ=DAILY";
  if (preset === "weekly") return "FREQ=WEEKLY";
  if (preset === "monthly") return "FREQ=MONTHLY";
  return existingRule?.trim() || undefined;
};

export const getRecurrenceSummary = (event: Pick<CalendarEventRecord, "recurrencePreset" | "recurrenceRule">) => {
  if (event.recurrencePreset === "none" && !event.recurrenceRule) return "No repeat";
  if (event.recurrencePreset !== "custom") {
    return event.recurrencePreset.charAt(0).toUpperCase() + event.recurrencePreset.slice(1);
  }
  return event.recurrenceRule ? `Custom: ${event.recurrenceRule}` : "Custom";
};

// Groundwork helper for future recurring-instance expansion in agenda/day/month renderers.
export const hasRecurringBehavior = (event: Pick<CalendarEventRecord, "recurrencePreset" | "recurrenceRule">) => {
  return event.recurrencePreset !== "none" || Boolean(event.recurrenceRule);
};
