import { useState } from "react";
import { TopBar } from "./components/layout/TopBar";
import { Sidebar } from "./components/layout/Sidebar";
import { Workspace } from "./components/layout/Workspace";
import { Inspector } from "./components/layout/Inspector";
import { StatusBar } from "./components/layout/StatusBar";
import { ExportPreview } from "./components/layout/ExportPreview";
import { ResizablePanel } from "./components/common/ResizablePanel";

export default function App() {
  const [exportOpen, setExportOpen] = useState(false);

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
