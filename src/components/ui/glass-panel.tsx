import type { PropsWithChildren } from "react";

export function GlassPanel({ children }: PropsWithChildren) {
  return <div className="rounded-xl border border-noema-border bg-noema-panel shadow-glass">{children}</div>;
}
