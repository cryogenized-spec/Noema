import Dexie, { type EntityTable } from "dexie";
import type { ChatMessage } from "@/types/chat";

class NoemaDatabase extends Dexie {
  messages!: EntityTable<ChatMessage, "id">;

  constructor() {
    super("noema-db");
    this.version(1).stores({
      messages: "++id, role, createdAt",
    });
  }
}

export const db = new NoemaDatabase();
