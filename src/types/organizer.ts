export type OrganizerModule = "documents" | "tasks" | "calendar";

export interface OrganizerModuleStatus {
  module: OrganizerModule;
  enabled: boolean;
}

export const ORGANIZER_MODULES: OrganizerModuleStatus[] = [
  { module: "documents", enabled: true },
  { module: "tasks", enabled: false },
  { module: "calendar", enabled: false },
];
