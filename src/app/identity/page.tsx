import type { Metadata } from "next";
import { IdentityCenter } from "@/components/identity/identity-center";
export const metadata: Metadata = {
  title: "NOEMA Identity & Devices",
  robots: { index: false, follow: false, noarchive: true },
};

export default function IdentityPage() {
  return <IdentityCenter />;
}
