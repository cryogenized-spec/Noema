"use client";

import { ContactCounter } from "@/components/layout/contact-counter";

/**
 * The one contact indicator belongs to the app chrome, not any individual
 * workspace tab. It survives navigation to Contacts, Identity and Profile.
 * The underlying counter never displays message content or decrypts it.
 */
export function GlobalContactNotification() {
  return (
    <div className="pointer-events-auto fixed right-[max(12px,env(safe-area-inset-right))] top-[calc(12px+env(safe-area-inset-top))] z-[60]">
      <ContactCounter />
    </div>
  );
}
