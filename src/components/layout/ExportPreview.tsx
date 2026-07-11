import { X, Download } from "lucide-react";
import { useMemo, useState } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import { exportToGameMaker } from "../../export/gameMakerExporter";

export function ExportPreview({ onClose }: { onClose: () => void }) {
  const project = useProjectStore((s) => s.project);
  const result = useMemo(() => exportToGameMaker(project), [project]);
  const [activeFile, setActiveFile] = useState(0);

  const downloadAll = () => {
    result.files.forEach((f) => {
      const blob = new Blob([f.content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = f.path.split("/").pop() ?? "export.gml";
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-8">
      <div className="glass rounded-lg w-full max-w-3xl max-h-full flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--op-10)]">
          <div className="text-sm font-medium">Export Preview — GameMaker</div>
          <button onClick={onClose} className="opacity-50 hover:opacity-100">
            <X size={16} />
          </button>
        </div>

        <div className="flex border-b border-[var(--op-10)] text-xs">
          {result.files.map((f, i) => (
            <button
              key={f.path}
              onClick={() => setActiveFile(i)}
              className={`px-3 py-2 mono ${i === activeFile ? "text-[var(--op-90)] border-b-2 border-accent" : "text-[var(--op-40)]"}`}
            >
              {f.path.split("/").pop()}
            </button>
          ))}
        </div>

        {result.warnings.length > 0 && (
          <div className="px-4 py-2 space-y-1 border-b border-[var(--op-10)] max-h-24 overflow-y-auto">
            {result.warnings.map((w, i) => (
              <div key={i} className="text-xs text-yellow-200/80">
                <span className="mono">{w.objectId}</span> — {w.message}
              </div>
            ))}
          </div>
        )}

        <pre className="flex-1 overflow-auto p-4 text-xs mono text-[var(--op-80)] whitespace-pre-wrap">
          {result.files[activeFile]?.content}
        </pre>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-[var(--op-10)]">
          <button onClick={onClose} className="text-sm px-3 py-1.5 rounded-md glass hover:bg-[var(--op-10)]">
            Cancel
          </button>
          <button
            onClick={downloadAll}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md bg-accent/80 hover:bg-accent"
          >
            <Download size={14} /> Download .gml
          </button>
        </div>
      </div>
    </div>
  );
}
