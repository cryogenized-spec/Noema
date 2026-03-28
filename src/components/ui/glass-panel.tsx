import type { PropsWithChildren } from "react";

export function GlassPanel({ children }: PropsWithChildren) {
  return (
    <div className="rounded-2xl border border-noema-border bg-noema-panel shadow-glass backdrop-blur-xl">
      {children}
    </div>
  );
}
