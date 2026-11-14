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
      <Link href="/invite/demo" className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-noema-border bg-[#161618] px-3 py-2 text-xs font-medium text-white transition hover:border-noema-lime/60 hover:text-noema-lime">
        <Icon icon="solar:link-round-bold" className="text-base" aria-hidden="true"/>
        <span className="hidden sm:inline">Try invitation</span>
        <span className="sm:hidden">Invite</span>
      </Link>
    </header>
  );
}
