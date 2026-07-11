import { ChevronLeft, ChevronRight } from "lucide-react";
import { useResizablePanel } from "../../lib/useResizablePanel";

export function ResizablePanel({
  panelKey,
  side,
  defaultWidth,
  min,
  max,
  children,
}: {
  panelKey: string;
  side: "left" | "right";
  defaultWidth: number;
  min: number;
  max: number;
  children: React.ReactNode;
}) {
  const { width, collapsed, setCollapsed, startResize } = useResizablePanel({ key: panelKey, defaultWidth, min, max, side });

  if (collapsed) {
    const Icon = side === "left" ? ChevronRight : ChevronLeft;
    return (
      <button
        onClick={() => setCollapsed(false)}
        title="Развернуть панель"
        className="w-3.5 shrink-0 h-full glass hover:bg-[var(--op-10)] flex items-center justify-center text-[var(--op-30)] hover:text-[var(--op-70)] transition-colors"
      >
        <Icon size={11} />
      </button>
    );
  }

  const CollapseIcon = side === "left" ? ChevronLeft : ChevronRight;
  const handle = (
    <div className="relative w-2.5 shrink-0 h-full group/handle">
      <div onMouseDown={startResize} className="absolute inset-y-0 -left-1.5 -right-1.5 cursor-col-resize z-10" />
      {/* Always-visible grip line so the draggable edge is discoverable, not just on hover */}
      <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-[var(--op-15)] group-hover/handle:bg-accent/70 group-hover/handle:w-0.5 transition-colors pointer-events-none" />
      <div className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 flex flex-col gap-0.5 pointer-events-none opacity-60 group-hover/handle:opacity-0 transition-opacity">
        <span className="w-0.5 h-0.5 rounded-full bg-[var(--op-30)]" />
        <span className="w-0.5 h-0.5 rounded-full bg-[var(--op-30)]" />
        <span className="w-0.5 h-0.5 rounded-full bg-[var(--op-30)]" />
      </div>
      <button
        onClick={() => setCollapsed(true)}
        title="Свернуть панель"
        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 left-1/2 w-4 h-4 rounded-full bg-[var(--op-15)] hover:bg-accent/70 grid place-items-center opacity-0 group-hover/handle:opacity-100 transition-opacity z-20"
      >
        <CollapseIcon size={10} />
      </button>
    </div>
  );

  return (
    <div className="flex h-full shrink-0" style={{ width }}>
      {side === "right" && handle}
      <div className="h-full min-w-0 min-h-0 flex-1 flex flex-col overflow-hidden">{children}</div>
      {side === "left" && handle}
    </div>
  );
}
