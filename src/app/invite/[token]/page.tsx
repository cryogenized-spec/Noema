import type { Metadata } from "next";
import { SecureContact } from "@/components/network/secure-contact";
export const metadata: Metadata = {
  title: "Private NOEMA invitation",
  referrer: "no-referrer",
  robots: { index:false,follow:false,noarchive:true },
};
export default async function InvitePage({
  params,
}: { params:Promise<{token:string}> }) {
  const { token }=await params;
  // A link preview is inert. Redemption requires a guest's explicit Continue.
  return <SecureContact inviteToken={token}/>;
}
