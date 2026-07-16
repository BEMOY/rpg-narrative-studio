import { useState } from "react";
import { Users, Package, MessageSquare } from "lucide-react";
import { useProjectStore } from "../../store/useProjectStore";

// Native HTML5 drag-and-drop mime keys, shared between this panel (the drag source) and
// whatever accepts the drop (CutscenePreview's stage, CutsceneTimeline's lanes). Renamed from
// the old CHARACTER_DRAG_MIME (v75) now that this same payload -- just an Entry id -- is used to
// drag ANY supported actor kind (character, object, item), not characters only; the string value
// itself is kept as-is since it's never persisted, only ever read back by the drop target in the
// same running session.
export const ACTOR_DRAG_MIME = "application/x-cutscene-character";
export const DIALOGUE_DRAG_MIME = "application/x-cutscene-dialogue";

// The Explorer/asset library panel inside the Cutscene editor window -- drag an actor (character
// or object/item) onto the Program Monitor stage to place them (creates a positioned clip + an
// "active"/appear key at the current playhead time), or onto the Timeline at a specific point in
// time to add their track there (see CutsceneTimeline.tsx's lane onDrop); drag a dialogue onto
// the Dialogue lane to drop it in at that point in time. The SAME Entry can be dragged in more
// than once -- each drop always creates its own independent cast instance (see
// CutsceneCastMember in types/database.ts), so two "Bandit" object instances on stage at once
// works without any special-casing. Locations/Music/Battles etc. from the fuller "universal
// director tool" vision still aren't wired up, since those need their own data model work first.
export function CutsceneExplorerPanel() {
  const allEntries = useProjectStore((s) => s.project.entries);
  const dialogues = useProjectStore((s) => s.project.dialogues);
  const characters = allEntries.filter((e) => e.category === "character");
  const objects = allEntries.filter((e) => e.category === "object" || e.category === "item");
  const [tab, setTab] = useState<"characters" | "objects" | "dialogues">("characters");

  const actorRow = (c: (typeof allEntries)[number]) => (
    <div
      key={c.id}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(ACTOR_DRAG_MIME, c.id);
        e.dataTransfer.effectAllowed = "copy";
      }}
      className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-[var(--op-5)] hover:bg-[var(--op-10)] cursor-grab text-xs text-[var(--op-70)]"
      title="Перетащите на превью (разместить) или на таймлайн в нужный момент времени (появление)"
    >
      {c.image ? (
        <img src={c.image} className="w-5 h-5 rounded-sm object-cover shrink-0" style={{ imageRendering: "pixelated" }} alt="" />
      ) : (
        <span className="w-5 h-5 rounded-sm bg-[var(--op-15)] shrink-0" />
      )}
      <span className="truncate">{c.name}</span>
    </div>
  );

  return (
    <div className="w-52 shrink-0 border-r border-[var(--op-10)] flex flex-col overflow-hidden">
      <div className="flex border-b border-[var(--op-10)] shrink-0">
        <button
          onClick={() => setTab("characters")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] ${
            tab === "characters" ? "text-accent border-b-2 border-accent" : "text-[var(--op-45)] hover:text-[var(--op-70)]"
          }`}
        >
          <Users size={12} /> Персонажи
        </button>
        <button
          onClick={() => setTab("objects")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] ${
            tab === "objects" ? "text-accent border-b-2 border-accent" : "text-[var(--op-45)] hover:text-[var(--op-70)]"
          }`}
        >
          <Package size={12} /> Объекты
        </button>
        <button
          onClick={() => setTab("dialogues")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] ${
            tab === "dialogues" ? "text-accent border-b-2 border-accent" : "text-[var(--op-45)] hover:text-[var(--op-70)]"
          }`}
        >
          <MessageSquare size={12} /> Диалоги
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {tab === "characters" && characters.map(actorRow)}
        {tab === "objects" && objects.map(actorRow)}
        {tab === "dialogues" &&
          dialogues.map((d) => (
            <div
              key={d.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(DIALOGUE_DRAG_MIME, d.id);
                e.dataTransfer.effectAllowed = "copy";
              }}
              className="px-2 py-1.5 rounded-md bg-[var(--op-5)] hover:bg-[var(--op-10)] cursor-grab text-xs text-[var(--op-70)] truncate"
              title="Перетащите на дорожку «Диалоги»"
            >
              {d.name}
            </div>
          ))}
        {tab === "characters" && characters.length === 0 && (
          <div className="text-[10px] text-[var(--op-30)] text-center py-4">Нет персонажей в проекте</div>
        )}
        {tab === "objects" && objects.length === 0 && (
          <div className="text-[10px] text-[var(--op-30)] text-center py-4">Нет объектов/предметов в проекте</div>
        )}
        {tab === "dialogues" && dialogues.length === 0 && (
          <div className="text-[10px] text-[var(--op-30)] text-center py-4">Нет диалогов в проекте</div>
        )}
      </div>
    </div>
  );
}
