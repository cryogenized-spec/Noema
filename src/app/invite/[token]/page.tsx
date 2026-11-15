import type { Metadata } from "next";
import { RelayWorkspace } from "@/components/network/relay-workspace";

export const metadata: Metadata = {
  title: "Private NOEMA invitation",
  referrer: "no-referrer",
  robots: { index: false, follow: false, noarchive: true },
};
export default async function InviteLandingPage({
  params,
}: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Reading a link is inert. Only the guest's explicit Continue button redeems.
  return <RelayWorkspace inviteToken={token} />;
}
