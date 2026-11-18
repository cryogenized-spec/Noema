import Dexie, { type EntityTable } from "dexie";
import type { ChatMessage } from "@/types/chat";
import type { AgentProfile } from "@/types/agents";
import type { ConversationThread } from "@/types/conversation";
import type { DocumentRecord } from "@/types/documents";
import type { DocumentAttachmentRecord } from "@/types/attachments";
import type { TaskRecord } from "@/types/tasks";
import type { CalendarEventRecord } from "@/types/calendar";
import type { WorkshopProfile } from "@/types/profile";
import type { ContactKeyRecord } from "@/types/contact";
import type { RssArticle, RssFolder, RssSubscription } from "@/types/rss";

class NoemaDatabase extends Dexie {
  messages!: EntityTable<ChatMessage, "id">;
  agents!: EntityTable<AgentProfile, "id">;
  threads!: EntityTable<ConversationThread, "id">;
  documents!: EntityTable<DocumentRecord, "id">;
  attachments!: EntityTable<DocumentAttachmentRecord, "id">;
  tasks!: EntityTable<TaskRecord, "id">;
  calendarEvents!: EntityTable<CalendarEventRecord, "id">;
  profiles!: EntityTable<WorkshopProfile, "id">;
  contactKeys!: EntityTable<ContactKeyRecord, "id">;
  rssSubscriptions!: EntityTable<RssSubscription, "id">;
  rssFolders!: EntityTable<RssFolder, "id">;
  rssArticles!: EntityTable<RssArticle, "id">;

  constructor() {
    super("noema-db");
    this.version(1).stores({
      messages: "++id, role, createdAt",
    });

    this.version(2).stores({
      messages: "++id, role, createdAt",
      agents: "++id, name, providerId, updatedAt",
    });

    this.version(3)
      .stores({
        messages: "++id, threadKey, role, kind, createdAt",
        agents: "++id, name, providerId, updatedAt",
        threads: "++id, threadKey, updatedAt",
      })
      .upgrade(async (tx) => {
        await tx
          .table("messages")
          .toCollection()
          .modify((message: ChatMessage) => {
            message.threadKey = message.threadKey ?? "default";
            message.kind = message.kind ?? (message.role === "system" ? "system" : message.role === "agent" ? "agent" : "user");
            message.author =
              message.author ?? {
                participantId: message.role === "agent" ? "agent" : message.role === "system" ? "system" : "self",
                isLocal: true,
                transport: "local",
              };
            message.delivery = message.delivery ?? { state: "local_only" };
          });

        const threadsTable = tx.table("threads");
        const existingDefault = await threadsTable.where("threadKey").equals("default").first();
        if (!existingDefault) {
          const now = new Date().toISOString();
          await threadsTable.add({
            threadKey: "default",
            title: "Main",
            participants: [
              { id: "self", role: "self", isLocal: true, displayName: "You" },
              { id: "agent", role: "agent", isLocal: true, displayName: "Noema Agent" },
            ],
            selectedAgentId: null,
            transportHint: "local",
            syncState: { status: "local_only" },
            createdAt: now,
            updatedAt: now,
          });
        }
      });

    this.version(4).stores({
      messages: "++id, threadKey, role, kind, createdAt",
      agents: "++id, name, providerId, updatedAt",
      threads: "++id, threadKey, updatedAt",
      documents: "++id, title, updatedAt, isArchived, isPinned, sourceType, *tags, folderId",
    });

    this.version(5).stores({
      messages: "++id, threadKey, role, kind, createdAt",
      agents: "++id, name, providerId, updatedAt",
      threads: "++id, threadKey, updatedAt",
      documents: "++id, title, updatedAt, isArchived, isPinned, sourceType, *tags, folderId",
      attachments: "++id, documentId, type, fileName, mimeType, localRef, createdAt",
    });

    this.version(6).stores({
      messages: "++id, threadKey, role, kind, createdAt",
      agents: "++id, name, providerId, updatedAt",
      threads: "++id, threadKey, updatedAt",
      documents: "++id, title, updatedAt, isArchived, isPinned, sourceType, *tags, folderId",
      attachments: "++id, documentId, type, fileName, mimeType, localRef, createdAt",
      tasks: "++id, title, status, priority, dueAt, updatedAt, isPinned, sourceType, *tags, folderId",
    });

    this.version(7).stores({
      messages: "++id, threadKey, role, kind, createdAt",
      agents: "++id, name, providerId, updatedAt",
      threads: "++id, threadKey, updatedAt",
      documents: "++id, title, updatedAt, isArchived, isPinned, sourceType, *tags, folderId",
      attachments: "++id, documentId, type, fileName, mimeType, localRef, createdAt",
      tasks: "++id, title, status, priority, dueAt, reminderAt, reminderEnabled, reminderState, updatedAt, isPinned, sourceType, *tags, folderId",
    });

    this.version(8).stores({
      messages: "++id, threadKey, role, kind, createdAt",
      agents: "++id, name, providerId, updatedAt",
      threads: "++id, threadKey, updatedAt",
      documents: "++id, title, updatedAt, isArchived, isPinned, sourceType, *tags, folderId",
      attachments: "++id, documentId, type, fileName, mimeType, localRef, createdAt",
      tasks: "++id, title, status, priority, dueAt, reminderAt, reminderEnabled, reminderState, updatedAt, isPinned, sourceType, *tags, folderId",
      calendarEvents:
        "++id, title, startAt, endAt, status, allDay, timezone, linkedTaskId, linkedDocumentId, sourceType, reminderEnabled, reminderAt, updatedAt, isPinned",
    });

    this.version(9).stores({
      messages: "++id, threadKey, role, kind, createdAt",
      agents: "++id, name, providerId, updatedAt",
      threads: "++id, threadKey, updatedAt",
      documents: "++id, title, updatedAt, isArchived, isPinned, sourceType, *tags, folderId",
      attachments: "++id, documentId, type, fileName, mimeType, localRef, createdAt",
      tasks: "++id, title, status, priority, dueAt, reminderAt, reminderEnabled, reminderState, updatedAt, isPinned, sourceType, *tags, folderId",
      calendarEvents:
        "++id, title, startAt, endAt, status, allDay, timezone, linkedTaskId, linkedDocumentId, sourceType, reminderEnabled, reminderAt, reminderState, recurrencePreset, updatedAt, isPinned",
    });

    // Preserves existing tables while introducing the singleton local workshop profile.
    this.version(10).stores({ profiles: "id, updatedAt" });

    // RADIX-inspired RSS subscriptions and bounded offline article cache.
    this.version(11).stores({
      rssSubscriptions: "id, &url, folderId, updatedAt, lastFetchedAt",
      rssFolders: "id, name",
      rssArticles: "id, subscriptionId, publishedAt, read, starred, fetchedAt",
    });
    // WebCrypto non-extractable HKDF roots persist per browser, not on the relay.
    this.version(12).stores({ contactKeys: "id, createdAt" });
  }
}

export const db = new NoemaDatabase();
