import type { PropsWithChildren } from "react";

export function GlassPanel({ children }: PropsWithChildren) {
  return (
    <div className="rounded-2xl border border-noema-border/90 bg-noema-glass/80 shadow-glass backdrop-blur-xl">
      {children}
    </div>
  );
}
