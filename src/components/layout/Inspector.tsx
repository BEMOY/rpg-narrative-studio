import { useState } from "react";
import { useProjectStore } from "../../store/useProjectStore";

const TABS = ["Properties", "References", "History", "Diagnostics"] as const;

export function Inspector() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Properties");
  const selectedId = useProjectStore((s) => s.selectedId);
  const item = useProjectStore((s) => s.project.items.find((i) => i.id === selectedId));

  return (
    <div className="w-[360px] glass shrink-0 flex flex-col overflow-hidden">
      <div className="flex border-b border-white/10 text-xs">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 transition-colors ${
              tab === t ? "text-white border-b-2 border-accent" : "text-white/40 hover:text-white/70"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 text-sm">
        {!item && <div className="text-white/30">Nothing selected.</div>}

        {item && tab === "Properties" && (
          <div className="space-y-3">
            <Row label="UUID" value={item.uuid} mono />
            <Row label="Readable ID" value={item.id} mono />
            <Row label="Version" value={String(item.version || 1)} />
            <Row label="Category" value={item.category} />
          </div>
        )}

        {item && tab === "References" && (
          <div className="text-white/40">
            <div className="mb-2 text-white/60">Incoming</div>
            <div className="text-xs mb-4">No objects reference this item yet.</div>
            <div className="mb-2 text-white/60">Outgoing</div>
            <div className="text-xs">
              rarity → <span className="mono">{item.rarityId}</span>
            </div>
          </div>
        )}

        {item && tab === "History" && <div className="text-white/30 text-xs">No history recorded in this session.</div>}

        {item && tab === "Diagnostics" && <Diagnostics itemId={item.id} />}
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-white/40">{label}</span>
      <span className={mono ? "mono text-white/80" : "text-white/80"}>{value}</span>
    </div>
  );
}

function Diagnostics({ itemId }: { itemId: string }) {
  const item = useProjectStore((s) => s.project.items.find((i) => i.id === itemId))!;
  const warnings: string[] = [];
  if (Object.values(item.stats).some((v) => v !== undefined && Math.abs(v) >= 9999)) {
    warnings.push("Suspicious stat magnitude — likely a min-clamp hack (see docs/12_Editors.md).");
  }
  if (item.type === "equip" && !item.overlay) {
    warnings.push("No worn appearance (overlay) set — item will be invisible on the character when equipped.");
  }
  if (warnings.length === 0) return <div className="text-white/30 text-xs">No issues found.</div>;
  return (
    <div className="space-y-2">
      {warnings.map((w, i) => (
        <div key={i} className="text-xs px-2 py-2 rounded-md bg-yellow-500/10 border border-yellow-500/20 text-yellow-200/90">
          {w}
        </div>
      ))}
    </div>
  );
}
