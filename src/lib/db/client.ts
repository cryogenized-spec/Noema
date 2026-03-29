import Dexie, { type EntityTable } from "dexie";
import type { ChatMessage } from "@/types/chat";
import type { AgentProfile } from "@/types/agents";

class NoemaDatabase extends Dexie {
  messages!: EntityTable<ChatMessage, "id">;
  agents!: EntityTable<AgentProfile, "id">;

  constructor() {
    super("noema-db");
    this.version(1).stores({
      messages: "++id, role, createdAt",
    });

    this.version(2).stores({
      messages: "++id, role, createdAt",
      agents: "++id, name, providerId, updatedAt",
    });
  }
}

export const db = new NoemaDatabase();
