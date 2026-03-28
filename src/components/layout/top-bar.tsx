import { GlassPanel } from "@/components/ui/glass-panel";

export function TopBar() {
  return (
    <GlassPanel>
      <header className="px-4 py-3">
        <p className="text-xs uppercase tracking-[0.24em] text-slate-300/90">Noema</p>
        <h1 className="text-lg font-semibold text-slate-50">Calm Intelligence</h1>
      </header>
    </GlassPanel>
  );
}
