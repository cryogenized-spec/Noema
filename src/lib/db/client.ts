import Dexie, { type Table } from 'dexie';
import type { ChatMessage } from '@/types/message';

class NoemaDatabase extends Dexie {
  messages!: Table<ChatMessage, string>;

  constructor() {
    super('noema');
    this.version(1).stores({
      messages: 'id, createdAt, role',
    });
  }
}

let dbInstance: NoemaDatabase | null = null;

export function getDb() {
  if (typeof window === 'undefined') {
    return null;
  }

  if (!dbInstance) {
    dbInstance = new NoemaDatabase();
  }

  return dbInstance;
}
