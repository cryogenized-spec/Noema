import { GlassPanel } from "@/components/ui/glass-panel";

export function TopBar() {
  return (
    <GlassPanel>
      <header className="px-4 py-2.5">
        <p className="text-[11px] uppercase tracking-[0.26em] text-slate-400">Noema</p>
        <h1 className="text-xl font-semibold tracking-tight text-slate-100">Calm Intelligence</h1>
      </header>
    </GlassPanel>
  );
}
