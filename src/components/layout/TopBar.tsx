import { Search, Play, Download, ArrowLeft } from "lucide-react";
import { useProjectStore } from "../../store/useProjectStore";
import { ThemeMenu } from "../ThemeMenu";

export function TopBar({ onExport }: { onExport: () => void }) {
  const projectName = useProjectStore((s) => s.project.name);
  const closeProject = useProjectStore((s) => s.closeProject);

  return (
    <div className="h-14 glass flex items-center gap-4 px-4 shrink-0">
      <button
        onClick={closeProject}
        title="К списку проектов"
        className="w-8 h-8 grid place-items-center rounded-md hover:bg-[var(--op-10)] text-[var(--op-50)] hover:text-[var(--op-90)] transition-colors"
      >
        <ArrowLeft size={16} />
      </button>
      <div className="font-semibold tracking-tight">{projectName}</div>
      <div className="text-[var(--op-30)]">/</div>
      <div className="text-sm text-[var(--op-50)]">Database</div>

      <div className="flex-1 flex items-center justify-center">
        <div className="glass rounded-md px-3 py-1.5 flex items-center gap-2 text-sm text-[var(--op-40)] w-80">
          <Search size={14} />
          <span>Search…</span>
          <span className="ml-auto text-xs mono">Ctrl K</span>
        </div>
      </div>

      <button className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md glass hover:bg-[var(--op-10)] transition-colors">
        <Play size={14} /> Run
      </button>
      <button
        onClick={onExport}
        className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md bg-accent/80 hover:bg-accent transition-colors"
      >
        <Download size={14} /> Export
      </button>
      <ThemeMenu />
    </div>
  );
}
