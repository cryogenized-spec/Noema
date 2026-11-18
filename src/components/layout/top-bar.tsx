"use client";

import Link from "next/link";
import Image from "next/image";
import { Icon } from "@iconify/react";
import { useEffect, useState } from "react";
import { db } from "@/lib/db/client";
import { ContactCounter } from "@/components/layout/contact-counter";

interface TopBarProps {
  onMenuToggle: () => void;
  mobileMenuOpen: boolean;
  desktopRailOpen: boolean;
}
export function TopBar({ onMenuToggle, mobileMenuOpen, desktopRailOpen }: TopBarProps) {
  const [avatarImage, setAvatarImage] = useState("");
  const [initial, setInitial] = useState("");
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void db.profiles.get("self").then((profile) => {
        if (!active) return;
        setAvatarImage(profile?.avatarImage ?? "");
        setInitial(profile?.alias?.trim().slice(0, 1).toUpperCase() ?? "");
      }).catch(() => { /* Local profile is optional. */ });
    };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("noema:profile-updated", refresh);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("noema:profile-updated", refresh);
    };
  }, []);

  return (
    <header className="relative z-20 flex h-[64px] min-h-[64px] min-w-0 items-center gap-2 border-b border-noema-border bg-[#0b0b0d] px-3 sm:px-5">
      <button type="button" onClick={onMenuToggle}
        aria-label="Toggle mobile navigation" aria-expanded={mobileMenuOpen}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-noema-border bg-[#151517] text-neutral-300 transition hover:border-noema-lime hover:text-noema-lime lg:hidden">
        <Icon icon="solar:hamburger-menu-linear" className="text-xl" aria-hidden="true" />
      </button>
      <button type="button" onClick={onMenuToggle}
        aria-label="Toggle desktop navigation" aria-expanded={desktopRailOpen}
        className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-noema-border bg-[#151517] text-neutral-300 transition hover:border-noema-lime hover:text-noema-lime lg:flex">
        <Icon icon="solar:hamburger-menu-linear" className="text-xl" aria-hidden="true" />
      </button>
      <Link href="/" className="flex min-w-0 flex-1 items-center" aria-label="NOEMA home">
        <Image src="/brand/noema-wordmark.svg" width={282} height={56} priority
          alt="NOEMA — Communication / Intelligence" unoptimized
          className="h-[48px] w-auto max-w-[min(64vw,240px)] object-contain object-left" />
      </Link>
      <ContactCounter />
      <Link href="/profile" aria-label="Open your workshop profile" title="Your profile"
        className="ml-auto flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-noema-border bg-[#171719] text-noema-lime transition hover:border-noema-lime">
        {avatarImage ? <Image src={avatarImage} alt="" width={80} height={80} unoptimized className="h-full w-full object-cover" />
          : initial ? <span className="text-sm font-bold" aria-hidden="true">{initial}</span>
          : <Icon icon="solar:user-circle-bold" className="text-xl" aria-hidden="true" />}
      </Link>
    </header>
  );
}
