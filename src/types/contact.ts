/** A browser-held, non-extractable key. Cloudflare never receives the secret. */
export interface ContactKeyRecord {
  id: string;
  key: CryptoKey;
  createdAt: string;
}
