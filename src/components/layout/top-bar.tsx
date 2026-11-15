import Link from "next/link";
import { Icon } from "@iconify/react";

export function TopBar() {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-noema-borderSoft pb-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-noema-border bg-[#101013] text-noema-lime" aria-hidden="true">
          <span className="text-xl font-semibold tracking-tight">N</span>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold tracking-[0.18em] text-white">NOEMA<span className="text-noema-lime">.</span></p>
          <p className="text-[10px] tracking-wide text-noema-muted">COMMUNICATION / INTELLIGENCE</p>
        </div>
      </div>
      <nav className="flex items-center gap-2">
        <Link href="/connect" className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-noema-lime/50 bg-[#182217] px-3 py-2 text-xs font-medium text-noema-lime transition hover:border-noema-lime">
          <Icon icon="solar:chat-round-bold" className="text-base" aria-hidden="true"/>
          <span>Connect</span>
        </Link>
        <Link href="/invite/demo" className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-noema-border bg-[#161618] px-3 py-2 text-xs font-medium text-white transition hover:border-noema-lime/60 hover:text-noema-lime">
          <Icon icon="solar:link-round-bold" className="text-base" aria-hidden="true"/>
          <span className="hidden sm:inline">Try preview</span>
          <span className="sm:hidden">Preview</span>
        </Link>
      </nav>
    </header>
  );
}
