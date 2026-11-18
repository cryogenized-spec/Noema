import { redirect } from "next/navigation";
import { SecureContact } from "@/components/network/secure-contact";

/**
 * Only the stable staging origin is bound to the registered Cloudflare owner.
 * Branch previews do not share IndexedDB/P-256 device identity with it.
 * Route protected previews to the existing relay-enabled hostname rather than
 * presenting a fresh, unregistered fingerprint as though it were the owner.
 *
 * Local development remains unchanged: it can still show relay setup when
 * NEXT_PUBLIC_NOEMA_RELAY_URL has not been configured.
 */
export default function ConnectPage() {
  const configured = Boolean(process.env.NEXT_PUBLIC_NOEMA_RELAY_URL);
  if (!configured && process.env.VERCEL_ENV === "preview") {
    redirect("https://noema-contact-staging.vercel.app/connect");
  }
  return <SecureContact />;
}
