// v77 — "живые обратные связи": the auto-computed "где используется" panel from the Dynarain
// vision. Rendered in two places off the same findUsages() index: the full block on the entry
// card (EntryDetail) and the compact list in the Inspector. Every row navigates straight to
// the using dialogue/scene/quest/map on click — the "бесшовное путешествие" pattern.
import { useMemo } from "react";
import { Link2, MessagesSquare } from "lucide-react";
import { useProjectStore } from "../../store/useProjectStore";
import { findUsages, groupUsages, USAGE_GROUP_LABEL, type Usage } from "../../lib/usages";
import { CAT_COLOR } from "../../types/database";
import { CAT_ICON } from "../../lib/categoryIcons";

export function useUsages(entryId: string) {
  const project = useProjectStore((s) => s.project);
  return useMemo(() => findUsages(project, entryId), [project, entryId]);
}

export function UsageRows({ usages, compact }: { usages: Usage[]; compact?: boolean }) {
  const entries = useProjectStore((s) => s.project.entries);
  const openEntry = useProjectStore((s) => s.openEntry);
  const setActiveDialogue = useProjectStore((s) => s.setActiveDialogue);
  const showDialogues = useProjectStore((s) => s.showDialogues);

  const open = (u: Usage) => {
    if (u.target.kind === "dialogue") {
      setActiveDialogue(u.target.id);
      showDialogues();
    } else {
      openEntry(u.target.id);
    }
  };

  const grouped = groupUsages(usages);

  if (usages.length === 0) {
    return <div className="text-xs text-[var(--op-30)]">Пока нигде не используется.</div>;
  }

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {[...grouped.entries()].map(([group, list]) => (
        <div key={group}>
          <div className="text-[9px] uppercase tracking-wider text-[var(--op-30)] mb-1">{USAGE_GROUP_LABEL[group]}</div>
          <div className="space-y-0.5">
            {list.map((u, i) => {
              const targetEntry = u.target.kind === "entry" ? entries.find((e) => e.id === u.target.id) : undefined;
              const Icon = targetEntry ? CAT_ICON[targetEntry.category] : MessagesSquare;
              const color = targetEntry ? CAT_COLOR[targetEntry.category] : "var(--op-50)";
              return (
                <button
                  key={`${u.target.kind}-${u.target.id}-${i}`}
                  onClick={() => open(u)}
                  title="Открыть"
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[var(--op-7)] text-left group"
                >
                  <Icon size={12} style={{ color }} className="shrink-0" />
                  <span className={`truncate ${compact ? "text-xs" : "text-sm"} text-[var(--op-80)] group-hover:text-[var(--op-95)]`}>
                    {u.label}
                  </span>
                  <span className={`ml-auto shrink-0 ${compact ? "text-[9px]" : "text-[10px]"} text-[var(--op-35)] text-right`}>
                    {u.detail}
                  </span>
                  <Link2 size={10} className="shrink-0 opacity-0 group-hover:opacity-60" />
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
