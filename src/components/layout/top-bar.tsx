import Link from "next/link";
import Image from "next/image";
import { Icon } from "@iconify/react";

interface TopBarProps {
  onMenuToggle: () => void;
  mobileMenuOpen: boolean;
  desktopRailOpen: boolean;
}
export function TopBar({ onMenuToggle, mobileMenuOpen, desktopRailOpen }: TopBarProps) {
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
      <Link href="/profile" aria-label="Open your workshop profile" title="Your profile"
        className="ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-noema-border bg-[#171719] text-noema-lime transition hover:border-noema-lime">
        <Icon icon="solar:user-circle-bold" className="text-xl" aria-hidden="true" />
      </Link>
    </header>
  );
}
