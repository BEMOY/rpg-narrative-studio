import { useMemo } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import { BugReportWidget } from "../reports/BugReportWidget";
import { computeProblems } from "../../lib/problems";

export function StatusBar() {
  const saving = useProjectStore((s) => s.saving);
  const itemCount = useProjectStore((s) => s.project.entries.length);
  const projectName = useProjectStore((s) => s.project.name);
  const projectId = useProjectStore((s) => s.projectId);
  const project = useProjectStore((s) => s.project);
  // Every current Problems-panel finding is surfaced here as a plain warning count — there's no
  // hard-error/soft-warning distinction in computeProblems yet, so all of them count toward the
  // ⚠ bucket rather than inventing a severity split that isn't backed by real logic yet.
  const problemCount = useMemo(() => computeProblems(project).length, [project]);

  return (
    <div className="h-7 glass shrink-0 flex items-center px-3 text-xs text-[var(--op-45)] gap-4">
      <span>{saving ? "Saving…" : projectId ? "Saved to cloud" : "Local demo — not saved"}</span>
      <span className="text-[var(--op-20)]">|</span>
      <span>Project/{projectName}</span>
      <div className="flex-1" />
      <span className="flex items-center gap-1.5">
        0 ⛔ · {problemCount} ⚠
        <BugReportWidget variant="inline" />
      </span>
      <span className="text-[var(--op-20)]">|</span>
      <span>{itemCount} объектов</span>
    </div>
  );
}
