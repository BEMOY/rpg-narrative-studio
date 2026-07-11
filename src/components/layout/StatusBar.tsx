import { useProjectStore } from "../../store/useProjectStore";

export function StatusBar() {
  const saving = useProjectStore((s) => s.saving);
  const itemCount = useProjectStore((s) => s.project.entries.length);

  return (
    <div className="h-7 glass shrink-0 flex items-center px-3 text-xs text-white/45 gap-4">
      <span>{saving ? "Saving…" : "Saved"}</span>
      <span className="text-white/20">|</span>
      <span>Project/Snowfall</span>
      <div className="flex-1" />
      <span>0 ⛔ · 0 ⚠</span>
      <span className="text-white/20">|</span>
      <span>{itemCount} объектов</span>
    </div>
  );
}
