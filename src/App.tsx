import { useEffect, useState } from "react";
import { TopBar } from "./components/layout/TopBar";
import { Sidebar } from "./components/layout/Sidebar";
import { Workspace } from "./components/layout/Workspace";
import { Inspector } from "./components/layout/Inspector";
import { StatusBar } from "./components/layout/StatusBar";
import { ExportPreview } from "./components/layout/ExportPreview";
import { ResizablePanel } from "./components/common/ResizablePanel";
import { useProjectStore } from "./store/useProjectStore";

export default function App() {
  const [exportOpen, setExportOpen] = useState(false);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);

  // App-wide undo/redo — Ctrl+Z / Ctrl+Y on Windows/Linux, Cmd+Z / Cmd+Shift+Z on Mac (plus
  // Ctrl+Shift+Z as a common alternate redo binding on either). Skipped while focus is inside a
  // text input/textarea/contentEditable so the BROWSER's own native per-field undo handles
  // Ctrl+Z there instead — otherwise undoing a typo would yank back the entire last project
  // edit instead of just the last few characters typed.
  useEffect(() => {
    const isEditableTarget = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((key === "y" && !e.shiftKey) || (key === "z" && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo]);

  return (
    <div className="h-full flex flex-col">
      <TopBar onExport={() => setExportOpen(true)} />
      <div className="flex-1 flex overflow-hidden">
        <ResizablePanel panelKey="sidebar" side="left" defaultWidth={280} min={200} max={440}>
          <Sidebar />
        </ResizablePanel>
        <Workspace />
        <ResizablePanel panelKey="inspector" side="right" defaultWidth={360} min={260} max={560}>
          <Inspector />
        </ResizablePanel>
      </div>
      <StatusBar />
      {exportOpen && <ExportPreview onClose={() => setExportOpen(false)} />}
    </div>
  );
}
