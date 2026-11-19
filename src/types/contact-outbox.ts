/** Durable ciphertext-only outbox record. Never place draft text, access tokens,
 * raw HKDF material or invitation links in this table. */
export interface ContactOutboxRecord {
  id:string;
  deviceId:string;
  threadId:string;
  keyId:string;
  clientMessageId:string;
  ciphertext:string;
  createdAt:string;
  blocked?:boolean;
}
