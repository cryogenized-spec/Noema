import Dexie, { type EntityTable } from "dexie";
import type { ChatMessage } from "@/types/chat";
import type { AgentProfile } from "@/types/agents";
import type { ConversationThread } from "@/types/conversation";

class NoemaDatabase extends Dexie {
  messages!: EntityTable<ChatMessage, "id">;
  agents!: EntityTable<AgentProfile, "id">;
  threads!: EntityTable<ConversationThread, "id">;

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
  }
}

export const db = new NoemaDatabase();
