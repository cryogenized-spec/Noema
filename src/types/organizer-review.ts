import type { OrganizerDraftEnvelope } from "@/lib/organizer-intelligence/types";

export type OrganizerReviewSource = "chat_conversion" | "document_intelligence" | "task_intelligence" | "calendar_intelligence";
export type OrganizerReviewStatus = "pending" | "accepted" | "discarded";

export interface OrganizerReviewItemRecord {
  id?: number;
  queueKey: string;
  status: OrganizerReviewStatus;
  source: OrganizerReviewSource;
  sourceLabel: string;
  sourceRef?: string;
  selectedAgentId?: number | null;
  draft: OrganizerDraftEnvelope;
  preview: string;
  createdAt: string;
  updatedAt: string;
}
