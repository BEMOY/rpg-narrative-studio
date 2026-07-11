import { useProjectStore } from "../../store/useProjectStore";
import { ResizablePanel } from "../common/ResizablePanel";
import { DialogueSidebar } from "./DialogueSidebar";
import { DialogueCanvas } from "./DialogueCanvas";
import { MessageSquareText } from "lucide-react";

export function DialoguesView() {
  const activeDialogueId = useProjectStore((s) => s.activeDialogueId);
  const dialogue = useProjectStore((s) => s.project.dialogues.find((d) => d.id === activeDialogueId));

  return (
    <div className="h-full flex overflow-hidden">
      <ResizablePanel panelKey="dialogues-sidebar" side="left" defaultWidth={230} min={180} max={360}>
        <DialogueSidebar />
      </ResizablePanel>
      <div className="flex-1 flex flex-col overflow-hidden">
        {dialogue ? (
          <DialogueCanvas dialogue={dialogue} />
        ) : (
          <div className="flex-1 grid place-items-center text-[var(--op-30)]">
            <div className="flex flex-col items-center gap-2">
              <MessageSquareText size={28} />
              <div className="text-sm">Выберите диалог слева или создайте новый.</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
