import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ScrollText,
  Flag,
  Swords,
  MessageSquare,
  Tag,
  ZoomIn,
  ZoomOut,
  Maximize2,
  X,
  Copy,
  Check,
  Download,
  Coins,
  Sparkles,
  Heart,
  Lock,
  LockOpen,
  Ban,
  CircleCheck,
  ToggleLeft,
  CircleAlert,
  Grid2X2,
  Search,
  ArrowUpRight,
  ArrowDownLeft,
} from "lucide-react";
import { useProjectStore } from "../../store/useProjectStore";
import { ResizablePanel } from "../common/ResizablePanel";
import { CAT_COLOR, isQuest, type Entry, type Dialogue, type DialogueFlagDef } from "../../types/database";
import { compileQuestsScript, objectiveDisplayMode, objectiveProgress } from "../../lib/questCompile";
import { FlagsManagerModal } from "../dialogue/FlagsManagerModal";
import { Tour, type TourStep } from "../tour/Tour";

const QUESTS_TOUR: TourStep[] = [
  { target: '[data-tour="quests-search"]', title: "Поиск и фильтры", body: "Ищите квест по названию, фильтруйте по основным/побочным. Клик по квесту в списке — фокус на нём в графе справа, без открытия редактора." },
  { target: '[data-tour="quests-list"]', title: "Список по главам", body: "Квесты сгруппированы по главам проекта — то же деление, что и в настройках Codex." },
  { target: '[data-tour="quests-grid-toggle"]', title: "Сетка и привязка", body: "Включите, чтобы ноды прилипали к сетке при перетаскивании — удобно для аккуратной раскладки." },
  {
    target: '[data-tour="quests-graph"]',
    title: "Карта влияния",
    body: "Квесты, их связи и статусы (доступен/заперт/пройден). Значки у подцелей показывают, какой диалог их проверяет или завершает.",
  },
];

// ---- roadmap graph (quest ↔ dialogue ↔ flag), adapted from GraphView.tsx's force layout ----

type NodeKind = "quest" | "dialogue" | "flag";

interface RoadmapNode {
  id: string;
  kind: NodeKind;
  label: string;
  color: string;
  entryId?: string; // quest -> Entry.id
  dialogueId?: string; // dialogue -> Dialogue.id
}

interface RoadmapEdge {
  from: string;
  to: string;
  note?: string;
  styleKind?: "unlock" | "block"; // dependency edges get distinct coloring from the default grey
}

interface NodePos {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const WIDTH = 3400;
const HEIGHT = 1900;
const IDEAL_LEN = 460; // was 300 — longer connectors read more clearly once dialogue mini-badges freed up space between quest columns
const MIN_ZOOM = 0.01; // 1% — lets very large/sprawling graphs still fully zoom-to-fit instead of clipping
const REPULSION = 34000;
const MAX_SETTLE_FRAMES = 220;
const IDLE_JITTER = 0.14;
const MIN_REPULSE_DIST = 70;
const MAX_VELOCITY = 18;

// Dialogue/flag nodes used to just drift toward the same vertical center band as the quest
// DAG columns, which let their "проверяет" edges cut diagonally across the whole quest layout
// and tangle with the dependency edges. Pulling each kind toward its own distinct horizontal
// lane keeps same-kind nodes clustered together and turns most crossings into a much calmer
// "fan" shape instead of a knot.
const DIALOGUE_Y_BAND = HEIGHT * 0.84;
const FLAG_Y_BAND = HEIGHT * 0.16;

// Quest cards are large fixed-size boxes (~190px wide, height varies with content) — the pure
// force-based repulsion below can still let two of them settle overlapping if an edge/column
// pull balances it out first, so a hard position-correction pass enforces this minimum
// center-to-center distance every frame regardless of what the forces alone would produce.
const QUEST_MIN_SEPARATION = 230;

const DIALOGUE_COLOR = "#7f9bd1";
const FLAG_COLOR = "#b08a5a";

// DAG-style left-to-right layering for quest nodes: quests with no incoming "unlocks"
// prerequisite sit in column 0; anything they unlock sits one column to the right, and so on —
// so the whole dependency web visually reads left-to-right instead of a tangled physics blob.
const COLUMN_BASE_X = 260;
const COLUMN_SPACING = 340;
const REAL_HALF_W = 95; // matches QuestNodeCard's w-[190px]

// Rectangle-boundary edge trimming — same idea as DialogueCanvas's boxEdgePoint, generalized
// with explicit half-width/half-height instead of a {x,y,w,h} box. A single fixed CIRCULAR
// radius (however tuned) can't represent a rectangular quest card correctly from every angle:
// too small on the axis it undershoots (line stops short, a visible gap before the card ever
// starts) or too large on the axis it overshoots (line cuts straight past the card's real
// border, into its middle). Intersecting the straight line against the target's actual
// half-width/half-height instead gives a consistent, correct trim no matter which direction
// the edge approaches from.
function rectEdgePoint(from: { x: number; y: number }, to: { x: number; y: number }, halfW: number, halfH: number) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return { x: to.x, y: to.y };
  const scaleX = dx !== 0 ? halfW / Math.abs(dx) : Infinity;
  const scaleY = dy !== 0 ? halfH / Math.abs(dy) : Infinity;
  const scale = Math.min(scaleX, scaleY);
  return { x: to.x - dx * scale, y: to.y - dy * scale };
}

function computeQuestDepths(quests: Entry[]): Map<string, number> {
  const ids = new Set(quests.map((q) => q.id));
  const incoming = new Map<string, string[]>(); // questId -> source quest ids that unlock it
  for (const q of quests) {
    for (const dep of q.questDependencies ?? []) {
      if (dep.kind !== "unlocks" || !dep.questId || !ids.has(dep.questId)) continue;
      if (!incoming.has(dep.questId)) incoming.set(dep.questId, []);
      incoming.get(dep.questId)!.push(q.id);
    }
  }
  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  function resolve(id: string): number {
    if (depth.has(id)) return depth.get(id)!;
    if (visiting.has(id)) return 0; // dependency cycle — bail out rather than recurse forever
    visiting.add(id);
    const sources = incoming.get(id) ?? [];
    const d = sources.length === 0 ? 0 : Math.max(...sources.map(resolve)) + 1;
    visiting.delete(id);
    depth.set(id, d);
    return d;
  }
  for (const q of quests) resolve(q.id);
  return depth;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function NodeIcon({ n }: { n: RoadmapNode }) {
  if (n.kind === "dialogue") return <MessageSquare size={16} />;
  if (n.kind === "flag") return <Tag size={14} />;
  return n.color === CAT_COLOR.side_quest ? <Swords size={16} /> : <Flag size={16} />;
}

// ---- quest dependency simulation ("what if this quest were completed?") ----

type QuestStatus = "completed" | "blocked" | "locked" | "available";

const STATUS_LABEL: Record<QuestStatus, string> = {
  completed: "пройден",
  blocked: "заблокирован",
  locked: "заперт",
  available: "доступен",
};

function statusColor(status: QuestStatus, categoryColor: string): string {
  return status === "completed" ? "#7cc98a" : status === "blocked" ? "#e0716f" : status === "locked" ? "var(--op-40)" : categoryColor;
}

// A quest with objectives where every one has reached its max is done in every practical
// sense (matches quest_check_complete() in the real engine) — it counts as "completed" in the
// roadmap even if nobody flipped its toggle by hand. A quest with zero objectives has nothing
// to finish automatically, so it stays governed purely by the manual toggle.
function objectivesAllDone(entry: Entry): boolean {
  const objs = entry.objectives ?? [];
  if (objs.length === 0) return false;
  return objs.every((o) => {
    const { current, max } = objectiveProgress(o);
    return current >= max;
  });
}

// Dependencies are declared FROM the source quest's perspective ("on completing this quest,
// quest X unlocks/blocks") — see QuestPanel in EntryEditor.tsx. To know quest B's own status we
// need the reverse index: who points AT B, and with which kind.
function computeQuestStatuses(quests: Entry[], simCompleted: Set<string>): Map<string, QuestStatus> {
  const byId = new Set(quests.map((q) => q.id));
  const unlockedBy = new Map<string, string[]>();
  const blockedBy = new Map<string, string[]>();
  for (const q of quests) {
    for (const dep of q.questDependencies ?? []) {
      if (!dep.questId || !byId.has(dep.questId)) continue;
      const map = dep.kind === "unlocks" ? unlockedBy : blockedBy;
      if (!map.has(dep.questId)) map.set(dep.questId, []);
      map.get(dep.questId)!.push(q.id);
    }
  }
  // Completion (manual "what-if" toggle OR every real objective finished) is resolved for
  // every quest first, since later quests' unlocked/blocked status depends on OTHER quests'
  // completion, not just their own toggle. EVERY candidate completion — whether it came from
  // the ephemeral simCompleted toggle OR from real, persisted objective progress — is
  // re-validated against its own "unlocks" gates every time, via the same fixpoint growth. Real
  // objective progress used to short-circuit this (a quest with objectives finished counted as
  // completed unconditionally, gates or not), which meant un-completing a prerequisite left any
  // already-finished descendant stuck showing "completed" forever, with the roadmap having no
  // way to reflect that its prerequisite chain no longer actually holds. Now BOTH sources only
  // "stick" while their full prerequisite chain is still satisfied by other quests that are
  // themselves validly completed — so turning a parent back off cascades all the way down,
  // however many levels the dependency chain goes. (See the useEffect below that also rolls
  // back the underlying real objective DATA for anything this invalidates, not just its
  // displayed status — "blocks" dependencies need no equivalent cascade: "blocked" isn't stored
  // state at all, it's derived fresh below from whatever `completed` ends up being.)
  const candidateComplete = new Set<string>();
  for (const q of quests) {
    if (objectivesAllDone(q) || simCompleted.has(q.id)) candidateComplete.add(q.id);
  }
  const completed = new Set<string>();
  let growing = true;
  while (growing) {
    growing = false;
    for (const q of quests) {
      if (completed.has(q.id) || !candidateComplete.has(q.id)) continue;
      const gates = unlockedBy.get(q.id) ?? [];
      if (gates.length === 0 || gates.every((id) => completed.has(id))) {
        completed.add(q.id);
        growing = true;
      }
    }
  }
  const statuses = new Map<string, QuestStatus>();
  for (const q of quests) {
    if (completed.has(q.id)) {
      statuses.set(q.id, "completed");
      continue;
    }
    const blockers = blockedBy.get(q.id) ?? [];
    if (blockers.some((id) => completed.has(id))) {
      statuses.set(q.id, "blocked");
      continue;
    }
    const gates = unlockedBy.get(q.id) ?? [];
    if (gates.length > 0 && !gates.every((id) => completed.has(id))) {
      statuses.set(q.id, "locked");
      continue;
    }
    statuses.set(q.id, "available");
  }
  return statuses;
}

function useQuestRoadmap() {
  const entries = useProjectStore((s) => s.project.entries);
  const dialogues = useProjectStore((s) => s.project.dialogues);

  return useMemo(() => {
    const quests = entries.filter((e) => isQuest(e.category));
    const questIds = new Set(quests.map((q) => q.id));

    const nodes: RoadmapNode[] = [];
    const nodeIds = new Set<string>();
    const addNode = (n: RoadmapNode) => {
      if (nodeIds.has(n.id)) return;
      nodeIds.add(n.id);
      nodes.push(n);
    };

    for (const q of quests) {
      addNode({ id: `q:${q.id}`, kind: "quest", label: q.name, color: CAT_COLOR[q.category], entryId: q.id });
    }

    const edgeKeys = new Set<string>();
    const edges: RoadmapEdge[] = [];
    const addEdge = (e: RoadmapEdge) => {
      const key = `${e.from}|${e.to}|${e.note ?? ""}`;
      if (edgeKeys.has(key)) return;
      edgeKeys.add(key);
      edges.push(e);
    };

    // quest -> flag ("устанавливает"), derived from objective.objId (matches quest_progress()
    // setting flag "obj_<objId>" once that objective reaches max)
    const flagNames = new Set<string>();
    for (const q of quests) {
      for (const o of q.objectives ?? []) {
        const raw = o.objId?.trim();
        if (!raw) continue;
        const flagName = `obj_${raw}`;
        const fid = `f:${flagName}`;
        addNode({ id: fid, kind: "flag", label: flagName, color: FLAG_COLOR });
        addEdge({ from: `q:${q.id}`, to: fid, note: "устанавливает" });
        flagNames.add(flagName);
      }
    }

    // quest -> quest ("открывает"/"блокирует"), from the Codex-only questDependencies —
    // declared from the completed quest's own perspective (see QuestPanel).
    for (const q of quests) {
      for (const dep of q.questDependencies ?? []) {
        if (!dep.questId || !questIds.has(dep.questId)) continue;
        addEdge({
          from: `q:${q.id}`,
          to: `q:${dep.questId}`,
          note: dep.kind === "unlocks" ? "открывает" : "блокирует",
          styleKind: dep.kind === "unlocks" ? "unlock" : "block",
        });
      }
    }

    // Dialogues used to appear as their own nodes in this graph (with "проверяет"/"завершает"
    // edges fanning out to every quest/flag they touched) — with more than a couple dialogues
    // that turned into a tangle of long diagonal lines crossing the whole quest DAG. That
    // relationship is now surfaced directly on the quest card itself instead (small badges +
    // per-objective indicator dots, see useDialogueQuestLinks below), so dialogues no longer
    // need a presence in this graph at all.
    return { nodes, edges, quests };
  }, [entries]);
}

export interface DialogueRef {
  dialogueId: string;
  name: string;
  nodeId: string;
}

export interface QuestDialogueLinks {
  checks: DialogueRef[];
  completes: DialogueRef[];
}

// Computes, for every quest and every individual objective, which dialogues check it
// (a condition reading quest_state()/the objective's "obj_<objId>" flag) and which complete or
// advance it (a choice's quest action). Feeds the small badge row under each quest card and the
// per-objective indicator dot instead of dedicated dialogue nodes in the roadmap graph.
export function useDialogueQuestLinks(quests: Entry[], dialogues: Dialogue[]) {
  return useMemo(() => {
    const byQuest = new Map<string, QuestDialogueLinks>();
    const byObjective = new Map<string, QuestDialogueLinks>(); // key `${questId}:${index}`
    const questIds = new Set(quests.map((q) => q.id));
    const objIdIndex = new Map<string, { questId: string; index: number }>();
    for (const q of quests) {
      (q.objectives ?? []).forEach((o, i) => {
        const raw = o.objId?.trim();
        if (raw) objIdIndex.set(`obj_${raw}`, { questId: q.id, index: i });
      });
    }
    const ensure = (map: Map<string, QuestDialogueLinks>, key: string) => {
      if (!map.has(key)) map.set(key, { checks: [], completes: [] });
      return map.get(key)!;
    };
    const addUnique = (list: DialogueRef[], ref: DialogueRef) => {
      if (!list.some((r) => r.dialogueId === ref.dialogueId && r.nodeId === ref.nodeId)) list.push(ref);
    };
    for (const d of dialogues) {
      for (const n of d.nodes) {
        const ref: DialogueRef = { dialogueId: d.id, name: d.name, nodeId: n.id };
        const conditions = [...n.lines.map((l) => l.condition), ...n.choices.map((c) => c.condition)];
        for (const c of conditions) {
          if (!c) continue;
          if (c.kind === "quest" && questIds.has(c.key)) {
            addUnique(ensure(byQuest, c.key).checks, ref);
          } else if (c.kind === "flag" && objIdIndex.has(c.key)) {
            const loc = objIdIndex.get(c.key)!;
            addUnique(ensure(byObjective, `${loc.questId}:${loc.index}`).checks, ref);
          }
        }
        // Quest actions can live on a CHOICE (fires when picked) or, since the "+ действие с
        // квестом" button was added to individual replicas too (see LineBlock in
        // DialogueNodeCard.tsx), directly on a LINE (fires the moment it's shown) — both count
        // as "completes" here, scanned together so neither surface silently drops out of the
        // quest card's badges/dots.
        const allQuestActions = [...n.lines.flatMap((l) => l.questActions ?? []), ...n.choices.flatMap((c) => c.questActions ?? [])];
        for (const qa of allQuestActions) {
          if (!qa.questId || !questIds.has(qa.questId)) continue;
          addUnique(ensure(byQuest, qa.questId).completes, ref);
          if (qa.kind === "advance" && qa.objectiveIndex != null) {
            addUnique(ensure(byObjective, `${qa.questId}:${qa.objectiveIndex}`).completes, ref);
          }
        }
      }
    }
    return { byQuest, byObjective };
  }, [quests, dialogues]);
}

// A small hoverable badge shown next to an objective row (or standalone in the quest-level
// chip strip) indicating that some dialogue "checks" (condition reads it) or "completes"
// (an action writes to it) this quest/objective. Uses DIALOGUE_COLOR normally; goes gray
// (but stays hoverable) when the quest is locked/blocked, per the "нельзя" — link should still
// be inspectable even though the quest itself can't be interacted with yet.
// Portal-rendered so the tooltip escapes the quest card's own `overflow-hidden` (needed for its
// rounded corners) — same reasoning as PortalMenu/EquipmentPresetsModal elsewhere in this app.
// Opens to the RIGHT of the node card (not just the dot) so it never overlaps the objective
// text it's sitting next to, matching where there's actually open canvas space in this graph.
// A chapter's frame in the roadmap: a bordered box (not just a full-width translucent band)
// that the writer can narrow or widen by dragging its right edge, clamped so it can never
// shrink past whatever width its own quests' dependency columns actually need. Local drag
// state lives here (not in RoadmapGraph) purely for isolation — this is otherwise a plain
// controlled render of `width` from the parent.
function ChapterFrame({
  chapterKey,
  band,
  color,
  zoom,
  minWidth,
  minHeight,
  onResize,
  onResizeHeight,
}: {
  chapterKey: string;
  band: { top: number; bottom: number; left: number; width: number; label: string };
  color: string;
  zoom: number;
  minWidth: number;
  minHeight: number;
  onResize: (width: number) => void;
  onResizeHeight: (height: number) => void;
}) {
  const dragRef = useRef<{ startClientX: number; startWidth: number } | null>(null);
  const [liveWidth, setLiveWidth] = useState<number | null>(null);
  const width = liveWidth ?? band.width;
  const bandHeight = band.bottom - band.top;
  const dragHRef = useRef<{ startClientY: number; startHeight: number } | null>(null);
  const [liveHeight, setLiveHeight] = useState<number | null>(null);
  const height = liveHeight ?? bandHeight;

  const onHandleDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { startClientX: e.clientX, startWidth: band.width };
    const move = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = (ev.clientX - dragRef.current.startClientX) / zoom;
      setLiveWidth(Math.max(minWidth, dragRef.current.startWidth + dx));
    };
    const up = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      setLiveWidth((w) => {
        if (w != null) onResize(w);
        return null;
      });
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  // Height can be stretched past its auto-computed size (see chapterBand) and dragged back
  // down again — down to `minHeight` (the chapter's own natural/auto height), not below it,
  // same floor `chapterBand` itself enforces via Math.max(autoHeight, saved). Note: since
  // chapters below this one are stacked directly under it, they only shift up/down once the
  // drag actually commits (onResizeHeight, on mouseup) — a brief visual overlap with the next
  // chapter while still dragging is an accepted trade-off for keeping this a simple,
  // self-contained preview.
  const onHandleDownV = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragHRef.current = { startClientY: e.clientY, startHeight: bandHeight };
    const move = (ev: MouseEvent) => {
      if (!dragHRef.current) return;
      const dy = (ev.clientY - dragHRef.current.startClientY) / zoom;
      setLiveHeight(Math.max(minHeight, dragHRef.current.startHeight + dy));
    };
    const up = () => {
      dragHRef.current = null;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      setLiveHeight((h) => {
        if (h != null) onResizeHeight(h);
        return null;
      });
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  return (
    <div className="absolute pointer-events-none rounded-lg" style={{ left: band.left, top: band.top, width, height }}>
      <div className="absolute inset-0 rounded-lg" style={{ background: `${color}0d`, border: `1px solid ${color}33` }} />
      <div
        className="absolute left-3 top-2 text-[11px] uppercase tracking-wider font-medium px-2 py-0.5 rounded-full"
        style={{ color, background: `${color}1a`, border: `1px solid ${color}40` }}
      >
        {band.label}
      </div>
      {/* Resize handles — slim strips on the frame's right and bottom edges, generously
          hit-testable (wider invisible hit area than their visible sliver) so they're easy to
          grab without fighting the graph's own pan-drag right next to them. */}
      <div
        onMouseDown={onHandleDown}
        title="Потяните, чтобы изменить ширину главы"
        className="absolute top-0 bottom-0 w-3 -right-1.5 cursor-ew-resize pointer-events-auto group"
      >
        <div
          className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 rounded-full opacity-0 group-hover:opacity-70 transition-opacity"
          style={{ background: color }}
        />
      </div>
      <div
        onMouseDown={onHandleDownV}
        title="Потяните вниз, чтобы растянуть высоту главы"
        className="absolute left-0 right-0 h-3 -bottom-1.5 cursor-ns-resize pointer-events-auto group"
      >
        <div
          className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-0.5 rounded-full opacity-0 group-hover:opacity-70 transition-opacity"
          style={{ background: color }}
        />
      </div>
    </div>
  );
}

function DialogueLinkDot({ refs, kind, dim, zoom }: { refs: DialogueRef[]; kind: "checks" | "completes"; dim: boolean; zoom: number }) {
  const dotRef = useRef<HTMLSpanElement>(null);
  const tooltipElRef = useRef<HTMLDivElement>(null);
  const cardElRef = useRef<HTMLElement | null>(null);
  const [tooltipAnchor, setTooltipAnchor] = useState<{ x: number; y: number; h: number } | null>(null);
  const requestDialogueNodeFocus = useProjectStore((s) => s.requestDialogueNodeFocus);
  if (refs.length === 0) return null;
  const dotColor = dim ? "var(--op-30)" : DIALOGUE_COLOR;
  const Icon = kind === "completes" ? CircleCheck : CircleAlert;
  const labelText = kind === "completes" ? "завершает" : "проверяет";

  const open = () => {
    const dotRect = dotRef.current?.getBoundingClientRect();
    if (!dotRect) return;
    cardElRef.current = dotRef.current?.closest<HTMLElement>(".quest-node-card") ?? null;
    // Anchored to the dot's OWN rect (not the card's), so the popup lines up exactly to the
    // right of the icon at the icon's own vertical position, rather than snapping to the
    // card's edge/top like before.
    setTooltipAnchor({ x: dotRect.right + 6 * zoom, y: dotRect.top + dotRect.height / 2, h: dotRect.height });
  };

  // Hover-bridging + "reasonable distance" close behavior: while the popup is open, track the
  // mouse globally instead of relying on the dot's own onMouseLeave (which fires the instant the
  // cursor crosses into the portaled tooltip, since that tooltip lives elsewhere in the DOM).
  // The popup stays open as long as the cursor is either still inside the quest node card OR
  // within a small padding of the tooltip itself; it closes once both conditions fail.
  useEffect(() => {
    if (!tooltipAnchor) return;
    const PAD_CARD = 8;
    const PAD_TOOLTIP = 32;
    const onMove = (e: MouseEvent) => {
      const { clientX: x, clientY: y } = e;
      const cardRect = cardElRef.current?.getBoundingClientRect();
      const insideCard =
        !!cardRect &&
        x >= cardRect.left - PAD_CARD &&
        x <= cardRect.right + PAD_CARD &&
        y >= cardRect.top - PAD_CARD &&
        y <= cardRect.bottom + PAD_CARD;
      const tipRect = tooltipElRef.current?.getBoundingClientRect();
      const nearTooltip =
        !!tipRect &&
        x >= tipRect.left - PAD_TOOLTIP &&
        x <= tipRect.right + PAD_TOOLTIP &&
        y >= tipRect.top - PAD_TOOLTIP &&
        y <= tipRect.bottom + PAD_TOOLTIP;
      if (!insideCard && !nearTooltip) setTooltipAnchor(null);
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [tooltipAnchor]);

  const handleClick = (r: DialogueRef) => {
    requestDialogueNodeFocus(r.dialogueId, r.nodeId);
    setTooltipAnchor(null);
  };

  return (
    <span ref={dotRef} className="relative inline-flex" onMouseEnter={open}>
      <span
        className="w-3.5 h-3.5 rounded-full grid place-items-center shrink-0 transition-colors duration-300 cursor-help"
        style={{ background: dim ? "var(--op-8)" : `${DIALOGUE_COLOR}22`, color: dotColor }}
      >
        <Icon size={9} />
      </span>
      {tooltipAnchor &&
        createPortal(
          // Positioned in real screen pixels (getBoundingClientRect already reflects the
          // graph's own pan/zoom transform), but the tooltip's own CONTENT needs an explicit
          // scale(zoom) on top of that — unlike every other element here, this one lives
          // outside the transformed world div (it's portaled straight to <body> to escape the
          // card's overflow-hidden), so it doesn't inherit that transform automatically and
          // would otherwise stay a fixed screen size while every node around it grows/shrinks.
          <div
            ref={tooltipElRef}
            className="fixed whitespace-nowrap rounded-md border px-1.5 py-1.5 text-[10px] z-[200] flex flex-col gap-1"
            style={{
              left: tooltipAnchor.x,
              top: tooltipAnchor.y,
              transform: `translateY(-50%) scale(${zoom})`,
              transformOrigin: "left center",
              background: "var(--popover-bg)",
              borderColor: DIALOGUE_COLOR,
              color: "var(--op-80)",
            }}
          >
            {/* Same rounded-pill look as the quest-level dialogue badges at the bottom of the
                card (icon + name + checks/completes label) — this popup and those badges are
                two views onto the exact same relationship, so they read as the same thing. */}
            {refs.map((r) => (
              <button
                key={`${r.dialogueId}:${r.nodeId}`}
                type="button"
                onClick={() => handleClick(r)}
                className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full border truncate max-w-full hover:bg-[var(--op-8)] transition-colors cursor-pointer"
                style={{ borderColor: DIALOGUE_COLOR, color: "var(--op-70)" }}
                title="Перейти к ноде диалога"
              >
                <Icon size={9} style={{ color: DIALOGUE_COLOR }} className="shrink-0" />
                <span className="truncate">{r.name}</span>
                <span className="opacity-50 shrink-0">{labelText}</span>
              </button>
            ))}
          </div>,
          document.body
        )}
    </span>
  );
}

function QuestNodeCard({
  entry,
  label,
  color,
  status,
  on,
  onToggle,
  onSetAllObjectives,
  onToggleObjective,
  entryById,
  questDialogueLinks,
  objectiveDialogueLinks,
  flagDefs,
  onSetObjectiveValue,
  zoom,
}: {
  entry?: Entry;
  label: string;
  color: string;
  status: QuestStatus;
  on: boolean;
  onToggle: () => void;
  onSetAllObjectives: (done: boolean) => void;
  onToggleObjective: (index: number) => void;
  entryById: Map<string, Entry>;
  questDialogueLinks?: QuestDialogueLinks;
  objectiveDialogueLinks: Map<string, QuestDialogueLinks>;
  flagDefs: Record<string, DialogueFlagDef>;
  onSetObjectiveValue: (index: number, value: number) => void;
  zoom: number;
}) {
  const requestDialogueNodeFocus = useProjectStore((s) => s.requestDialogueNodeFocus);
  const objectives = entry?.objectives ?? [];
  const rewards = entry?.rewards;
  const items = rewards?.items ?? [];
  const hasRewards = !!(rewards && (rewards.coins || rewards.xp || rewards.affinity || items.length));
  const statusIcon =
    status === "completed" ? (
      <CircleCheck size={12} />
    ) : status === "blocked" ? (
      <Ban size={12} />
    ) : status === "locked" ? (
      <Lock size={12} />
    ) : (
      <LockOpen size={12} />
    );
  const cardStatusColor = statusColor(status, color);
  // Locked/blocked quests have nothing to simulate until their prerequisites are resolved —
  // the toggle is disabled. An already-completed (all objectives done) quest can still be
  // toggled OFF, though: that's the "undo" path, and it resets every objective's checkbox too.
  const toggleDisabled = status === "locked" || status === "blocked";

  return (
    <div
      className="quest-node-card w-[190px] rounded-lg shadow-lg border-2 transition-all duration-300 overflow-hidden group-hover:scale-[1.03]"
      style={{
        background: "var(--popover-bg)",
        borderColor: cardStatusColor,
        opacity: status === "locked" || status === "blocked" ? 0.7 : 1,
        filter: status === "locked" ? "grayscale(0.6)" : "none",
      }}
    >
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-[var(--op-10)]">
        {entry?.category === "side_quest" ? (
          <Swords size={13} style={{ color }} className="shrink-0" />
        ) : (
          <Flag size={13} style={{ color }} className="shrink-0" />
        )}
        {/* Only clicking THIS title text opens the quest card — clicking anywhere else on the
            card (background, badges, toggle) used to open it too, and misclicks while just
            trying to glance at/drag the node kept sending the writer to the card by accident. */}
        <span data-node-open-handle="true" className="text-[11px] font-medium text-[var(--op-85)] truncate flex-1 hover:underline decoration-dotted underline-offset-2">
          {label}
        </span>
      </div>
      <div className="px-2 py-1.5 space-y-1.5">
        {objectives.length > 0 && (
          <div className="space-y-0.5">
            {objectives.map((o, i) => {
              const display = objectiveDisplayMode(o, flagDefs);
              const current = Math.max(0, Math.min(display.max, o.current ?? (o.done ? display.max : 0)));
              const done = current >= display.max;
              const objLinks = entry ? objectiveDialogueLinks.get(`${entry.id}:${i}`) : undefined;
              return (
                <div key={i} className="flex items-center gap-1">
                  {display.kind === "slider" ? (
                    <div
                      className={`flex-1 min-w-0 flex items-center gap-1.5 text-[10px] ${toggleDisabled ? "opacity-60" : ""}`}
                      style={{ color: done ? "#7cc98a" : "var(--op-45)" }}
                    >
                      <span className="truncate shrink-0 max-w-[64px]">{o.text || `Цель ${i + 1}`}</span>
                      <input
                        type="range"
                        min={0}
                        max={display.max}
                        value={current}
                        disabled={toggleDisabled}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          if (toggleDisabled) return;
                          onSetObjectiveValue(i, Number(e.target.value));
                        }}
                        className="flex-1 min-w-0 h-1 accent-current"
                      />
                      <span className="mono opacity-70 shrink-0">
                        {current}/{display.max}
                      </span>
                    </div>
                  ) : (
                    <button
                      disabled={toggleDisabled}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (toggleDisabled) return;
                        onToggleObjective(i);
                      }}
                      title={
                        toggleDisabled
                          ? status === "locked"
                            ? "Заперт — сначала выполните квест(ы)-предпосылки"
                            : "Заблокирован завершённым квестом"
                          : done
                          ? "Снять галочку с подцели"
                          : "Отметить подцель выполненной"
                      }
                      className={`flex-1 min-w-0 flex items-center gap-1 text-[10px] text-left ${toggleDisabled ? "cursor-not-allowed opacity-60" : "hover:opacity-80"}`}
                      style={{ color: done ? "#7cc98a" : "var(--op-45)" }}
                    >
                      {done ? <CircleCheck size={10} className="shrink-0" /> : <span className="w-2.5 h-2.5 rounded-full border border-current shrink-0" />}
                      <span className="truncate flex-1">{o.text || `Цель ${i + 1}`}</span>
                      <span className="mono opacity-70 shrink-0">
                        {current}/{display.max}
                      </span>
                    </button>
                  )}
                  {objLinks && (objLinks.checks.length > 0 || objLinks.completes.length > 0) && (
                    <span
                      className="flex items-center gap-0.5 shrink-0"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <DialogueLinkDot refs={objLinks.checks} kind="checks" dim={toggleDisabled} zoom={zoom} />
                      <DialogueLinkDot refs={objLinks.completes} kind="completes" dim={toggleDisabled} zoom={zoom} />
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {hasRewards && (
          <div className="flex items-center gap-2 flex-wrap text-[10px] text-[var(--op-45)]">
            {!!rewards?.coins && (
              <span className="flex items-center gap-0.5">
                <Coins size={10} /> {rewards.coins}
              </span>
            )}
            {!!rewards?.xp && (
              <span className="flex items-center gap-0.5">
                <Sparkles size={10} /> {rewards.xp}
              </span>
            )}
            {!!rewards?.affinity && (
              <span className="flex items-center gap-0.5">
                <Heart size={10} /> {rewards.affinity}
              </span>
            )}
            {items.map((it, i) => {
              const linked = entryById.get(it.id);
              return linked?.image ? (
                <span key={i} className="flex items-center gap-0.5" title={`${linked.name} ×${it.count}`}>
                  <img src={linked.image} alt="" className="w-4 h-4 rounded object-cover" style={{ imageRendering: "pixelated" }} />
                  <span className="opacity-70">×{it.count}</span>
                </span>
              ) : (
                <span key={i} className="opacity-70" title={linked?.name}>
                  +{it.count} {linked?.name ?? "предм."}
                </span>
              );
            })}
          </div>
        )}
        {questDialogueLinks && (questDialogueLinks.checks.length > 0 || questDialogueLinks.completes.length > 0) && (
          <div className="flex items-center gap-1 flex-wrap" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
            {questDialogueLinks.completes.map((r) => (
              <button
                key={`c-${r.dialogueId}-${r.nodeId}`}
                type="button"
                onClick={() => requestDialogueNodeFocus(r.dialogueId, r.nodeId)}
                className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full border truncate max-w-full hover:bg-[var(--op-8)] transition-colors cursor-pointer"
                style={{ borderColor: DIALOGUE_COLOR, color: "var(--op-70)" }}
                title={`Перейти к ноде — завершает: ${r.name}`}
              >
                <CircleCheck size={9} style={{ color: DIALOGUE_COLOR }} className="shrink-0" />
                <span className="truncate">{r.name}</span>
                <span className="opacity-50 shrink-0">завершает</span>
              </button>
            ))}
            {questDialogueLinks.checks.map((r) => (
              <button
                key={`k-${r.dialogueId}-${r.nodeId}`}
                type="button"
                onClick={() => requestDialogueNodeFocus(r.dialogueId, r.nodeId)}
                className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full border truncate max-w-full hover:bg-[var(--op-8)] transition-colors cursor-pointer"
                style={{ borderColor: DIALOGUE_COLOR, color: "var(--op-70)" }}
                title={`Перейти к ноде — проверяет: ${r.name}`}
              >
                <CircleAlert size={9} style={{ color: DIALOGUE_COLOR }} className="shrink-0" />
                <span className="truncate">{r.name}</span>
                <span className="opacity-50 shrink-0">проверяет</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between gap-1.5 pt-0.5">
          <span className="flex items-center gap-1 text-[10px] transition-colors duration-300" style={{ color: cardStatusColor }}>
            {statusIcon} {STATUS_LABEL[status]}
          </span>
          <button
            disabled={toggleDisabled}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              if (toggleDisabled) return;
              if (objectives.length > 0) onSetAllObjectives(!on);
              else onToggle();
            }}
            title={
              toggleDisabled
                ? status === "locked"
                  ? "Заперт — сначала выполните квест(ы)-предпосылки"
                  : "Заблокирован завершённым квестом"
                : objectives.length > 0
                ? on
                  ? "Снять отметку со всех подцелей"
                  : "Отметить все подцели выполненными"
                : "Симуляция: считать этот квест пройденным"
            }
            className={`relative w-8 h-[16px] rounded-full transition-colors duration-300 shrink-0 ${toggleDisabled ? "cursor-not-allowed opacity-50" : ""}`}
            style={{ background: on ? "#7cc98a" : "var(--op-15)" }}
          >
            <span
              className={`absolute top-[2px] w-[12px] h-[12px] rounded-full bg-white shadow transition-all duration-300 ${on ? "left-[14px]" : "left-[2px]"}`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}

function RoadmapGraph({
  nodes,
  edges,
  onOpenQuest,
  onOpenDialogue,
  hoveredId,
  setHoveredId,
  entries,
  statuses,
  simCompleted,
  onToggleCompleted,
  onSetAllObjectives,
  onToggleObjective,
  dialogueLinks,
  savedPositions,
  onPersistPosition,
  focusRequest,
  flagDefs,
  onSetObjectiveValue,
  chapters,
  gridEnabled,
  onSetGridEnabled,
  savedChapterWidths,
  onSetChapterWidth,
  savedChapterHeights,
  onSetChapterHeight,
}: {
  nodes: RoadmapNode[];
  edges: RoadmapEdge[];
  onOpenQuest: (id: string) => void;
  onOpenDialogue: (id: string) => void;
  hoveredId: string | null;
  setHoveredId: (id: string | null) => void;
  entries: Entry[];
  statuses: Map<string, QuestStatus>;
  simCompleted: Set<string>;
  onToggleCompleted: (questId: string) => void;
  onSetAllObjectives: (questId: string, done: boolean) => void;
  onToggleObjective: (questId: string, index: number) => void;
  dialogueLinks: { byQuest: Map<string, QuestDialogueLinks>; byObjective: Map<string, QuestDialogueLinks> };
  savedPositions: Record<string, { x: number; y: number }>;
  onPersistPosition: (nodeId: string, x: number, y: number) => void;
  focusRequest: { nodeId: string; token: number } | null;
  flagDefs: Record<string, DialogueFlagDef>;
  onSetObjectiveValue: (questId: string, index: number, value: number) => void;
  chapters: string[];
  gridEnabled: boolean;
  onSetGridEnabled: (enabled: boolean) => void;
  savedChapterWidths: Record<string, number>;
  onSetChapterWidth: (chapterKey: string, width: number) => void;
  savedChapterHeights: Record<string, number>;
  onSetChapterHeight: (chapterKey: string, height: number) => void;
}) {
  const posRef = useRef<Map<string, NodePos>>(new Map());
  const pinnedRef = useRef<Set<string>>(new Set());
  const anchorRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const draggingRef = useRef<{ id: string; startClientX: number; startClientY: number; startX: number; startY: number; openHandle: boolean } | null>(null);
  const panDragRef = useRef<{ startClientX: number; startClientY: number; startPanX: number; startPanY: number } | null>(null);
  // A short celebratory shake, keyed by node id and counting down in frames — triggered only
  // by the "пройден" toggle actually switching on (see the statuses-watching effect below),
  // never by dragging.
  const shakeRef = useRef<Map<string, number>>(new Map());
  const prevStatusRef = useRef<Map<string, QuestStatus>>(new Map());
  // Cascade-revert scheduling + visual snapshot — see the effect below for the full
  // explanation. `cascadeScheduledRef` tracks which quest ids currently have an in-flight
  // staggered revert (so re-running the effect doesn't restart/cancel everyone else's
  // countdown), `cascadeTimersRef` holds the actual setTimeout handles (so a quest can have its
  // pending revert CANCELED if it stops being orphaned before its timer fires — e.g. the parent
  // got re-completed by hand in the meantime), and `cascadeSnapshotRef` freezes each pending
  // quest's pre-revert entry so it keeps rendering as "still completed" until the moment its
  // own timer actually lands, instead of the whole chain visually flipping to locked at once
  // (status is a pure, synchronous function of the dependency graph — it updates instantly for
  // the WHOLE chain the moment the root toggle changes, well before any individual revert has
  // actually fired).
  const cascadeScheduledRef = useRef<Set<string>>(new Set());
  const cascadeTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const cascadeSnapshotRef = useRef<Map<string, Entry>>(new Map());
  // Real React state (not a ref) since this drives an actual CSS opacity transition for the
  // "blocked" red-X pop, rather than feeding the imperative physics loop.
  const [blockFlash, setBlockFlash] = useState<Map<string, "in" | "out">>(new Map());
  const [, bump] = useState(0);
  const [zoom, setZoom] = useState(0.65);
  const [pan, setPan] = useState({ x: 30, y: 20 });
  const [rippleNodeId, setRippleNodeId] = useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const GRID_SIZE = 40;
  const snapToGrid = (v: number) => Math.round(v / GRID_SIZE) * GRID_SIZE;

  const nodeIds = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes]);

  const quests = useMemo(() => entries.filter((e) => isQuest(e.category)), [entries]);
  const depths = useMemo(() => computeQuestDepths(quests), [quests]);
  const columnXById = useMemo(() => {
    const m = new Map<string, number>();
    for (const q of quests) m.set(`q:${q.id}`, COLUMN_BASE_X + (depths.get(q.id) ?? 0) * COLUMN_SPACING);
    return m;
  }, [quests, depths]);

  // Chapter "swimlanes" — dependency columns already separate quests horizontally by
  // prerequisite depth; this adds a second, vertical grouping by chapter so the roadmap reads
  // as "chapter 1's quests up top, chapter 2's below it" etc, while dependency arrows still
  // draw freely across lanes (a quest can obviously unlock something in a later chapter). Only
  // chapters that actually have a quest get a lane — an empty chapter in project.chapters
  // wouldn't need its own band. "" is the synthetic bucket for quests with no chapter set.
  const chapterKeyByQuestId = useMemo(() => {
    const m = new Map<string, string>();
    for (const q of quests) m.set(q.id, q.chapter && chapters.includes(q.chapter) ? q.chapter : "");
    return m;
  }, [quests, chapters]);
  const chapterOrder = useMemo(() => {
    const used = new Set(chapterKeyByQuestId.values());
    const ordered = chapters.filter((c) => used.has(c));
    if (used.has("")) ordered.push("");
    return ordered;
  }, [chapters, chapterKeyByQuestId]);
  // How many quests actually live in each chapter — feeds proportional band sizing right below,
  // so a chapter with one quest doesn't reserve the same vertical space as one with twenty.
  const questCountByChapter = useMemo(() => {
    const m = new Map<string, number>();
    for (const q of quests) {
      const key = chapterKeyByQuestId.get(q.id) ?? "";
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return m;
  }, [quests, chapterKeyByQuestId]);
  const CHAPTER_BAND_PAD = 90;
  const CHAPTER_LEFT = 40;
  const DEFAULT_CHAPTER_WIDTH = WIDTH - CHAPTER_LEFT * 2;
  // The narrowest a chapter's frame is allowed to shrink to — enough to still contain every one
  // of its quests' own dependency-column X position (their normal left-to-right position stays
  // driven by dependency depth same as always; this only bounds how far the frame itself can be
  // dragged in before it'd start clipping nodes that are supposed to be inside it).
  const chapterMinWidth = useMemo(() => {
    const m = new Map<string, number>();
    for (const q of quests) {
      const key = chapterKeyByQuestId.get(q.id) ?? "";
      const colX = columnXById.get(`q:${q.id}`) ?? COLUMN_BASE_X;
      const needed = colX - CHAPTER_LEFT + REAL_HALF_W + 60;
      m.set(key, Math.max(m.get(key) ?? 320, needed));
    }
    return m;
  }, [quests, chapterKeyByQuestId, columnXById]);
  // Band height used to be a flat 1/n split of the canvas regardless of how many quests were
  // actually in each chapter — a one-quest epilogue got the exact same huge band as a
  // twenty-quest main chapter, wasting space on the light one and cramping the heavy one.
  // Now each band's share of the fixed usable height is proportional to its own quest count
  // (with a MIN_BAND_H floor so a light chapter never collapses to an unreadable sliver, and
  // the leftover space after flooring is redistributed to the remaining bands by their own
  // weight) — scales sensibly from a single quest up to a huge chapter. Width, unlike height,
  // is writer-controlled rather than auto-computed (see the resize handle in the render below)
  // — how much horizontal room a chapter's dependency chain actually needs to breathe isn't
  // something a formula can guess well, so it defaults to the full canvas width and the writer
  // narrows or widens it by hand, clamped to chapterMinWidth above and persisted per chapter.
  const chapterBand = useMemo(() => {
    const m = new Map<string, { top: number; bottom: number; center: number; label: string; left: number; width: number; right: number; autoHeight: number }>();
    const n = chapterOrder.length;
    if (n === 0) return m;
    const usableH = HEIGHT - CHAPTER_BAND_PAD * 2;
    const MIN_BAND_H = 220;
    const weights = chapterOrder.map((key) => Math.max(1, questCountByChapter.get(key) ?? 0));
    const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
    const rawHeights = weights.map((w) => (usableH * w) / totalWeight);
    const flooredIdx = new Set<number>();
    rawHeights.forEach((h, i) => {
      if (h < MIN_BAND_H) flooredIdx.add(i);
    });
    const flooredTotal = flooredIdx.size * MIN_BAND_H;
    const remaining = Math.max(0, usableH - flooredTotal);
    const flexIdx = chapterOrder.map((_, i) => i).filter((i) => !flooredIdx.has(i));
    const flexWeightSum = flexIdx.reduce((sum, i) => sum + weights[i], 0) || 1;
    const autoHeights = chapterOrder.map((_, i) => (flooredIdx.has(i) ? MIN_BAND_H : (remaining * weights[i]) / flexWeightSum));
    // Writer-stretched height only ever GROWS a band past its auto-computed fair share —
    // there's no "fit content" floor to fight here like width has, since the proportional
    // split above is already a sensible default on its own.
    const heights = chapterOrder.map((key, i) => Math.max(autoHeights[i], savedChapterHeights[key] ?? 0));
    let cursor = CHAPTER_BAND_PAD;
    chapterOrder.forEach((key, i) => {
      const bandH = heights[i];
      const top = cursor;
      const bottom = top + bandH;
      const minW = chapterMinWidth.get(key) ?? 320;
      const savedW = savedChapterWidths[key];
      const width = Math.max(minW, savedW ?? DEFAULT_CHAPTER_WIDTH);
      m.set(key, {
        top,
        bottom,
        center: top + bandH / 2,
        label: key || "Без главы",
        left: CHAPTER_LEFT,
        width,
        right: CHAPTER_LEFT + width,
        // The chapter's own natural/auto-computed height, exposed separately from `bottom -
        // top` (which can be writer-inflated) so the height resize handle knows how far it's
        // allowed to shrink BACK DOWN to — see ChapterFrame's minHeight prop.
        autoHeight: autoHeights[i],
      });
      cursor = bottom;
    });
    return m;
  }, [chapterOrder, questCountByChapter, chapterMinWidth, savedChapterWidths, savedChapterHeights]);
  // Union bounding box of every chapter's actual frame — used to size the background grid so
  // it covers exactly the chapter areas' footprint (no more, no less), instead of the fixed
  // WIDTH/HEIGHT canvas constants, which no longer match once chapters can grow taller/wider
  // than their auto-computed defaults via the resize handles.
  const chapterAreaBounds = useMemo(() => {
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const band of chapterBand.values()) {
      left = Math.min(left, band.left);
      top = Math.min(top, band.top);
      right = Math.max(right, band.right);
      bottom = Math.max(bottom, band.bottom);
    }
    if (!isFinite(left)) return { left: 0, top: 0, width: WIDTH, height: HEIGHT };
    return { left, top, width: right - left, height: bottom - top };
  }, [chapterBand]);

  const CHAPTER_COLORS = ["#8b7bff", "#5fc9c9", "#e0a95f", "#6fb35c", "#d65a6b", "#5b8dff", "#c98ae0"];
  const chapterColor = (key: string) => CHAPTER_COLORS[Math.max(0, chapterOrder.indexOf(key)) % CHAPTER_COLORS.length];

  // Cross-chapter quest->quest dependency edges must be excluded from the physics simulation's
  // spring force too, not just from being DRAWN as a long line — otherwise the edge-length
  // spring still yanks the two nodes toward each other every frame regardless of chapter,
  // completely defeating the chapter swimlane target force (which is comparatively weak) and
  // dragging the "child" quest's real node visually into the "parent"'s chapter band. This is
  // the set portal rendering (further down, in the render body) also treats as
  // "draw a portal stub instead of a direct line" — keeping both derived from the same source
  // of truth so they can never disagree.
  const crossChapterEdgeSet = useMemo(() => {
    const set = new Set<string>();
    for (const e of edges) {
      if (!e.styleKind) continue;
      if (!e.from.startsWith("q:") || !e.to.startsWith("q:")) continue;
      const chFrom = chapterKeyByQuestId.get(e.from.slice(2));
      const chTo = chapterKeyByQuestId.get(e.to.slice(2));
      if (chFrom !== undefined && chTo !== undefined && chFrom !== chTo) set.add(`${e.from}->${e.to}`);
    }
    return set;
  }, [edges, chapterKeyByQuestId]);

  useEffect(() => {
    const pos = posRef.current;
    for (const key of Array.from(pos.keys())) {
      if (!nodeIds.has(key)) pos.delete(key);
    }
    nodes.forEach((n, i) => {
      if (!pos.has(n.id)) {
        const saved = savedPositions[n.id];
        if (saved) {
          // User dragged this node in a previous session — restore it verbatim instead of
          // letting the force layout re-seed it, so a reload doesn't undo manual arranging.
          // EXCEPT for the vertical axis on quest nodes: if the quest's chapter was reassigned
          // (or this position predates the chapter-swimlane feature entirely) since it was last
          // dragged, a stale saved Y would otherwise pin it in the wrong band FOREVER — pinned
          // nodes skip the chapter-targeting force completely (see tick() below), so nothing
          // would ever correct it on its own. Clamp the restored Y into the quest's CURRENT
          // band right away and persist that correction back, so this is a one-time fix rather
          // than something that has to re-happen on every load.
          let restoredY = saved.y;
          if (n.kind === "quest" && n.entryId) {
            const chKey = chapterKeyByQuestId.get(n.entryId);
            const band = chKey != null ? chapterBand.get(chKey) : undefined;
            if (band && (restoredY < band.top || restoredY > band.bottom)) {
              restoredY = clamp(restoredY, band.top + 20, band.bottom - 20);
              onPersistPosition(n.id, saved.x, restoredY);
            }
          }
          pos.set(n.id, { x: saved.x, y: restoredY, vx: 0, vy: 0 });
          pinnedRef.current.add(n.id);
          anchorRef.current.set(n.id, { x: saved.x, y: restoredY });
          return;
        }
        const colX = columnXById.get(n.id);
        if (colX != null) {
          // Seed quest nodes near their dependency-depth column right away so the layout
          // reads left-to-right from the very first frame instead of starting from a random
          // ring and slowly drifting into columns.
          pos.set(n.id, { x: colX, y: HEIGHT / 2 + (((i * 137) % 800) - 400), vx: 0, vy: 0 });
        } else {
          const angle = (i / Math.max(1, nodes.length)) * Math.PI * 2;
          const r = 300 + ((i * 67) % 220);
          pos.set(n.id, { x: WIDTH / 2 + Math.cos(angle) * r, y: HEIGHT / 2 + Math.sin(angle) * r, vx: 0, vy: 0 });
        }
      }
    });
  }, [nodes, nodeIds, columnXById, chapterKeyByQuestId, chapterBand, savedPositions, onPersistPosition]);

  // When a chapter's band TOP moves — because the writer stretched its own height, or an
  // earlier chapter in the stack grew/shrank and pushed every later swimlane down/up — every
  // quest node belonging to that chapter needs to shift by the exact same delta. Without this,
  // a node keeps its stale absolute Y while its band moves out from under it; the per-frame
  // hard clamp in tick() below then slams it against whichever edge it now falls outside of,
  // and for a PINNED node that clamp is a permanent correction (it gets persisted — see the
  // self-heal block in tick()), so the node visually glues itself to that edge and never
  // returns to its actual saved offset even after the band moves back. Shifting by the delta
  // instead preserves each node's relative position within its own band.
  const prevChapterTopRef = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    const prevTops = prevChapterTopRef.current;
    const pos = posRef.current;
    let questsByChapter: Map<string, string[]> | null = null;
    for (const [key, band] of chapterBand) {
      const prevTop = prevTops.get(key);
      if (prevTop != null && Math.abs(band.top - prevTop) > 0.5) {
        const delta = band.top - prevTop;
        if (!questsByChapter) {
          questsByChapter = new Map();
          for (const [qId, chKey] of chapterKeyByQuestId) {
            if (!questsByChapter.has(chKey)) questsByChapter.set(chKey, []);
            questsByChapter.get(chKey)!.push(qId);
          }
        }
        for (const qId of questsByChapter.get(key) ?? []) {
          const id = `q:${qId}`;
          const p = pos.get(id);
          if (p) p.y += delta;
          const anchor = anchorRef.current.get(id);
          if (anchor) {
            const ny = anchor.y + delta;
            anchorRef.current.set(id, { x: anchor.x, y: ny });
            if (pinnedRef.current.has(id)) onPersistPosition(id, anchor.x, ny);
          }
        }
      }
    }
    const nextTops = new Map<string, number>();
    for (const [key, band] of chapterBand) nextTops.set(key, band.top);
    prevChapterTopRef.current = nextTops;
  }, [chapterBand, chapterKeyByQuestId, onPersistPosition]);

  // Cascade-revert: a quest can have real, persisted objective progress (from clicking its own
  // "пройден" toggle, or manually ticking subtasks) marking it complete, while ITS OWN unlock
  // gates are no longer satisfied — e.g. its prerequisite quest just got un-completed in this
  // same what-if sandbox. computeQuestStatuses already reflects that mismatch in the STATUS it
  // reports, but the underlying objective DATA doesn't fix itself on its own — this is what
  // actually rolls it back to default, so the quest genuinely re-locks instead of just LOOKING
  // locked while still secretly holding finished objective data.
  //
  // Two things this has to get right that a naive "find orphans, schedule reverts" effect
  // doesn't:
  //  1. computeQuestStatuses resolves the ENTIRE dependency fixpoint synchronously — the moment
  //     the root toggle changes, EVERY downstream quest's displayed status already flips to
  //     "locked" in that same render, long before any staggered revert has actually fired. If
  //     rendering just reads `statuses` directly, the whole chain visually snaps to locked
  //     instantly and the staggered timing becomes invisible. cascadeSnapshotRef freezes each
  //     newly-orphaned quest's entry (still showing "completed") the moment it's detected, and
  //     the render below (where `entry`/`status` are read for each card) uses that snapshot
  //     instead of the live value for as long as the quest stays in cascadeScheduledRef — so a
  //     card only visually flips at the exact moment ITS OWN staggered timer lands.
  //  2. This effect re-runs every time `quests` changes — including because ITS OWN scheduled
  //     onSetAllObjectives call just fired. Without tracking what's already scheduled, that
  //     re-run would treat every STILL-orphaned quest as "newly" orphaned and restart their
  //     countdown from scratch, and — worse — if a quest stops being orphaned mid-flight (the
  //     writer re-completed the parent by hand before this quest's own timer landed) there was
  //     no way to cancel its now-stale pending revert, so it could fire anyway and leave a
  //     freshly-valid quest incorrectly un-completed (or vice versa, leave a should-have-reverted
  //     quest's stale "done" objective data around to silently reappear as "completed" the next
  //     time its gate happens to be satisfied again). cascadeScheduledRef/cascadeTimersRef make
  //     this idempotent: already-scheduled ids are left alone on re-runs, and anything that's no
  //     longer orphaned gets its pending timer explicitly canceled and its snapshot dropped.
  useEffect(() => {
    const orphaned = quests.filter((q) => objectivesAllDone(q) && statuses.get(q.id) !== "completed");
    const orphanedIds = new Set(orphaned.map((q) => q.id));

    for (const id of Array.from(cascadeScheduledRef.current)) {
      if (!orphanedIds.has(id)) {
        cascadeScheduledRef.current.delete(id);
        const t = cascadeTimersRef.current.get(id);
        if (t) clearTimeout(t);
        cascadeTimersRef.current.delete(id);
        cascadeSnapshotRef.current.delete(id);
      }
    }

    const newlyOrphaned = orphaned.filter((q) => !cascadeScheduledRef.current.has(q.id));
    if (newlyOrphaned.length === 0) return;

    // Deepest/farthest first, shallowest (closest to whatever was actually toggled) last.
    const sorted = [...newlyOrphaned].sort((a, b) => (depths.get(b.id) ?? 0) - (depths.get(a.id) ?? 0));
    const GAP_START = 1000; // ms — the first, most noticeable hop
    const GAP_FLOOR = 90;
    const GAP_DECAY = 0.6; // each subsequent gap is ~60% of the previous one — an accelerating cadence
    let cumulative = 0;
    for (const q of sorted) {
      cascadeScheduledRef.current.add(q.id);
      cascadeSnapshotRef.current.set(q.id, q);
      const gap = Math.max(GAP_FLOOR, GAP_START * Math.pow(GAP_DECAY, cascadeScheduledRef.current.size - 1));
      cumulative += gap;
      const timer = setTimeout(() => {
        cascadeScheduledRef.current.delete(q.id);
        cascadeTimersRef.current.delete(q.id);
        cascadeSnapshotRef.current.delete(q.id);
        onSetAllObjectives(q.id, false);
        // Shake exactly now — the moment this specific card's snapshot is dropped and it
        // actually catches up to its true (locked) status — instead of relying on the generic
        // status-flip shake effect, which would otherwise fire for the whole chain at once.
        shakeRef.current.set(`q:${q.id}`, 22);
      }, cumulative);
      cascadeTimersRef.current.set(q.id, timer);
    }
  }, [quests, statuses, onSetAllObjectives, depths]);

  // Shake feedback on any meaningful status flip — completed turning on OR off, and a quest
  // freshly becoming blocked by someone else's completion. Compares against the previous
  // render's statuses rather than living inside the animation loop, since `statuses` is a prop
  // that changes independently of the physics effect below; `shakeRef` is the shared hand-off
  // point the tick() loop reads from every frame. A fresh "blocked" transition additionally
  // pops up a red X over the card for a moment (see blockFlash state + render below).
  useEffect(() => {
    const prev = prevStatusRef.current;
    for (const [id, status] of statuses) {
      const prevStatus = prev.get(id);
      if (!prev.has(id)) continue; // skip the very first computation (initial load, no real "transition" yet)
      const completedChanged = (status === "completed") !== (prevStatus === "completed");
      const freshlyBlocked = status === "blocked" && prevStatus !== "blocked";
      // A completedChanged transition caused by cascade-revert is intentionally NOT shaken
      // here — that quest is still showing its frozen pre-revert snapshot (see
      // cascadeSnapshotRef above) and gets its own shake fired at the exact moment its
      // staggered timer actually lands, from inside the cascade-scheduling effect itself.
      // Shaking it here too would fire the animation immediately, well before the card has
      // visually caught up, defeating the whole point of staggering it.
      if ((completedChanged && !cascadeScheduledRef.current.has(id)) || freshlyBlocked) {
        shakeRef.current.set(`q:${id}`, 22);
      }
      if (freshlyBlocked) {
        const key = `q:${id}`;
        setBlockFlash((m) => new Map(m).set(key, "in"));
        setTimeout(() => setBlockFlash((m) => (m.has(key) ? new Map(m).set(key, "out") : m)), 700);
        setTimeout(
          () =>
            setBlockFlash((m) => {
              if (!m.has(key)) return m;
              const next = new Map(m);
              next.delete(key);
              return next;
            }),
          1300
        );
      }
    }
    prevStatusRef.current = new Map(statuses);
  }, [statuses]);

  useEffect(() => {
    let frame = 0;
    let raf = 0;
    const ids = nodes.map((n) => n.id);

    // Nodes no longer sway forever — a passively damped spring/repulsion system with no
    // continuous energy source settles to a dead stop on its own. The only motion after the
    // initial layout settle comes from a brief, decaying "throw" velocity applied the moment a
    // node is released after being dragged (see onNodePointerDown's onUp) — untouched nodes
    // never get that kick and simply stay put once equilibrium is reached.
    const degree = new Map<string, number>();
    for (const e of edges) {
      degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
      degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
    }
    const isolatedByKind = new Map<string, string[]>();
    for (const n of nodes) {
      if ((degree.get(n.id) ?? 0) > 0) continue;
      if (!isolatedByKind.has(n.kind)) isolatedByKind.set(n.kind, []);
      isolatedByKind.get(n.kind)!.push(n.id);
    }
    const kindById = new Map<string, NodeKind>();
    for (const n of nodes) kindById.set(n.id, n.kind);
    const questIds = ids.filter((id) => kindById.get(id) === "quest");

    // Hard per-frame safety net: whatever the spring/repulsion/overlap-correction forces below
    // computed, a quest node's Y can never leave its OWN chapter's band. Every previous fix to
    // this recurring bug (excluding cross-chapter edges from the spring force, clamping stale
    // saved positions, live-correcting pinned anchors) addressed a specific FORCE that could
    // push a node into the wrong band, but the always-on global repulsion (every node repels
    // every other node, completely chapter-agnostic — see the very next loop) and the
    // hard-overlap-correction pass further down both directly move quest nodes without any
    // chapter awareness at all, and are individually strong enough at close range to overpower
    // the comparatively weak 0.0006 chapter-targeting pull. Rather than trying to keep tuning
    // that arms race, this clamps the RESULT unconditionally: no matter what pushed a quest
    // node around this frame, its y always gets snapped back inside its band's bounds before
    // the frame ends.
    const clampToChapterBand = (id: string, y: number) => {
      if (kindById.get(id) !== "quest") return y;
      const qId = id.startsWith("q:") ? id.slice(2) : id;
      const chKey = chapterKeyByQuestId.get(qId);
      const band = chKey != null ? chapterBand.get(chKey) : undefined;
      if (!band) return y;
      return clamp(y, band.top + 20, band.bottom - 20);
    };
    // Same hard-safety-net idea, horizontally — now that a chapter's frame has a writer-set
    // WIDTH (not just the canvas-wide band it used to be), a quest node needs to stay inside
    // its own chapter's horizontal bounds too, for exactly the same reasons (repulsion/overlap
    // correction don't know or care about chapter frames).
    const clampToChapterX = (id: string, x: number) => {
      if (kindById.get(id) !== "quest") return x;
      const qId = id.startsWith("q:") ? id.slice(2) : id;
      const chKey = chapterKeyByQuestId.get(qId);
      const band = chKey != null ? chapterBand.get(chKey) : undefined;
      if (!band) return x;
      return clamp(x, band.left + 20, band.right - 20);
    };

    function tick() {
      const pos = posRef.current;
      for (let i = 0; i < ids.length; i++) {
        const a = pos.get(ids[i]);
        if (!a) continue;
        let fx = 0;
        let fy = 0;
        for (let j = 0; j < ids.length; j++) {
          if (i === j) continue;
          const b = pos.get(ids[j]);
          if (!b) continue;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), MIN_REPULSE_DIST);
          const force = REPULSION / (dist * dist);
          fx += (dx / dist) * force;
          fy += (dy / dist) * force;
        }
        a.vx += fx * 0.02;
        a.vy += fy * 0.02;
      }
      for (const e of edges) {
        if (crossChapterEdgeSet.has(`${e.from}->${e.to}`)) continue; // see portal rendering — no direct line, so no spring pull either
        const a = pos.get(e.from);
        const b = pos.get(e.to);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const force = (dist - IDEAL_LEN) * 0.02;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }
      for (const [, isoIds] of isolatedByKind) {
        if (isoIds.length < 2) continue;
        let cx = 0;
        let cy = 0;
        let n = 0;
        for (const id of isoIds) {
          const p = pos.get(id);
          if (!p) continue;
          cx += p.x;
          cy += p.y;
          n++;
        }
        if (n < 2) continue;
        cx /= n;
        cy /= n;
        for (const id of isoIds) {
          const p = pos.get(id);
          if (!p) continue;
          p.vx += (cx - p.x) * 0.0025;
          p.vy += (cy - p.y) * 0.0025;
        }
      }
      for (const id of ids) {
        const p = pos.get(id);
        if (!p) continue;
        if (draggingRef.current?.id === id) {
          p.vx = 0;
          p.vy = 0;
          continue;
        }
        // Completion shake — a short, quick buzz (distinct from the old idle sway, which no
        // longer exists) applied only for a couple dozen frames right after a quest's
        // "пройден" toggle flips on. Feeds into the same velocity/damping pipeline below so it
        // decays away exactly like the drag-release float does.
        const shakeLeft = shakeRef.current.get(id);
        if (shakeLeft && shakeLeft > 0) {
          const amp = (shakeLeft / 22) * 6;
          p.vx += Math.sin(frame * 2.3) * amp;
          p.vy += Math.cos(frame * 2.7) * amp;
          const next = shakeLeft - 1;
          if (next <= 0) shakeRef.current.delete(id);
          else shakeRef.current.set(id, next);
        }
        if (pinnedRef.current.has(id)) {
          // Pinned (previously dragged) nodes stay anchored near where they were dropped,
          // but keep a gentle perpetual bob instead of freezing dead — matches GraphView. A
          // pinned QUEST node additionally gets a weak, ongoing pull toward its chapter's own
          // band (much weaker than the anchor pull, so it doesn't fight a deliberate drag
          // within the band) — this is what self-heals a node whose chapter got reassigned
          // WITHOUT reloading the page (the one-time seed-time correction above only runs once,
          // on first mount, so a live edit needs this instead).
          let anchor = anchorRef.current.get(id) ?? p;
          if (kindById.get(id) === "quest") {
            const qId = id.startsWith("q:") ? id.slice(2) : id;
            const chKey = chapterKeyByQuestId.get(qId);
            const band = chKey != null ? chapterBand.get(chKey) : undefined;
            if (band && (anchor.y < band.top || anchor.y > band.bottom)) {
              // The anchor itself is stale (chapter reassigned live, without a reload) — snap
              // it into the band once so subsequent frames pull toward the CORRECT spot instead
              // of fighting between the old anchor and the new band forever, and persist the
              // fix so it sticks.
              const correctedY = clamp(anchor.y, band.top + 20, band.bottom - 20);
              anchorRef.current.set(id, { x: anchor.x, y: correctedY });
              anchor = anchorRef.current.get(id)!;
              onPersistPosition(id, anchor.x, correctedY);
            }
          }
          p.vx += (anchor.x - p.x) * 0.03;
          p.vy += (anchor.y - p.y) * 0.03;
          p.vx *= 0.88;
          p.vy *= 0.88;
          const speed = Math.hypot(p.vx, p.vy);
          if (speed > MAX_VELOCITY) {
            p.vx = (p.vx / speed) * MAX_VELOCITY;
            p.vy = (p.vy / speed) * MAX_VELOCITY;
          } else if (speed < 0.03) {
            p.vx = 0;
            p.vy = 0;
          }
          p.x = clampToChapterX(id, clamp(p.x + p.vx, 40, WIDTH - 40));
          p.y = clampToChapterBand(id, clamp(p.y + p.vy, 40, HEIGHT - 40));
          continue;
        }
        const colX = columnXById.get(id);
        if (colX != null) {
          // Quest node, unpinned — pulled toward its dependency-depth column instead of the
          // canvas center, so prerequisites end up left of whatever they unlock. Vertically it's
          // pulled toward its OWN chapter's swimlane instead of a flat mid-canvas band, so
          // quests naturally cluster by chapter (dependency arrows still draw freely across
          // lanes when a quest unlocks something in a different chapter).
          const questId = id.startsWith("q:") ? id.slice(2) : id;
          const chKey = chapterKeyByQuestId.get(questId);
          const band = chKey != null ? chapterBand.get(chKey) : undefined;
          const questTargetY = band ? band.center : HEIGHT / 2;
          p.vx += (colX - p.x) * 0.01;
          p.vy += (questTargetY - p.y) * 0.0006;
        } else {
          p.vx += (WIDTH / 2 - p.x) * 0.0006;
          const kind = kindById.get(id);
          const targetY = kind === "dialogue" ? DIALOGUE_Y_BAND : kind === "flag" ? FLAG_Y_BAND : HEIGHT / 2;
          p.vy += (targetY - p.y) * 0.0018;
        }
        p.vx *= 0.9;
        p.vy *= 0.9;
        const speed = Math.hypot(p.vx, p.vy);
        if (speed > MAX_VELOCITY) {
          p.vx = (p.vx / speed) * MAX_VELOCITY;
          p.vy = (p.vy / speed) * MAX_VELOCITY;
        } else if (speed < 0.03) {
          p.vx = 0;
          p.vy = 0;
        }
        p.x = clampToChapterX(id, clamp(p.x + p.vx, 40, WIDTH - 40));
        p.y = clampToChapterBand(id, clamp(p.y + p.vy, 40, HEIGHT - 40));
      }

      // Hard overlap correction for quest cards specifically — they're the biggest, most
      // visually important nodes, and pure force-based repulsion can still let a pair settle
      // overlapped if an edge/column pull balances it out first. Directly separating any pair
      // still nearer than QUEST_MIN_SEPARATION after the force pass guarantees they never
      // visually stack, regardless of what the forces alone would have produced.
      for (let i = 0; i < questIds.length; i++) {
        const a = pos.get(questIds[i]);
        if (!a) continue;
        for (let j = i + 1; j < questIds.length; j++) {
          const b = pos.get(questIds[j]);
          if (!b) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
          if (dist >= QUEST_MIN_SEPARATION) continue;
          const push = (QUEST_MIN_SEPARATION - dist) / 2;
          const nx = dx / dist;
          const ny = dy / dist;
          if (draggingRef.current?.id !== questIds[i]) {
            a.x = clampToChapterX(questIds[i], clamp(a.x - nx * push, 40, WIDTH - 40));
            a.y = clampToChapterBand(questIds[i], clamp(a.y - ny * push, 40, HEIGHT - 40));
          }
          if (draggingRef.current?.id !== questIds[j]) {
            b.x = clampToChapterX(questIds[j], clamp(b.x + nx * push, 40, WIDTH - 40));
            b.y = clampToChapterBand(questIds[j], clamp(b.y + ny * push, 40, HEIGHT - 40));
          }
        }
      }

      frame++;
      bump((n) => n + 1);
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [nodes, edges, columnXById, crossChapterEdgeSet, chapterKeyByQuestId, chapterBand, onPersistPosition]);

  const onNodePointerDown = (n: RoadmapNode, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const p = posRef.current.get(n.id);
    if (!p) return;
    const openHandle = (e.target as HTMLElement | null)?.closest?.('[data-node-open-handle="true"]') != null;
    draggingRef.current = { id: n.id, startClientX: e.clientX, startClientY: e.clientY, startX: p.x, startY: p.y, openHandle };
    let moved = false;
    // On release, the node gets a brief decaying float instead of either freezing dead or
    // swaying forever — but it's computed as the AVERAGE velocity over the whole drag
    // (distance moved / time held), not the instantaneous per-mousemove delta. Per-event
    // deltas are noisy (mousemove fires irregularly, so dividing by a tiny dt spikes the
    // estimate) and reads as a jittery shake on release; a single time-averaged value glides
    // smoothly instead.
    const dragStartAt = performance.now();
    const onMove = (ev: MouseEvent) => {
      const d = draggingRef.current;
      if (!d) return;
      const dxScreen = ev.clientX - d.startClientX;
      const dyScreen = ev.clientY - d.startClientY;
      if (Math.abs(dxScreen) > 4 || Math.abs(dyScreen) > 4) moved = true;
      const pos = posRef.current.get(d.id);
      if (!pos) return;
      const rawX = d.startX + dxScreen / zoom;
      const rawY = d.startY + dyScreen / zoom;
      pos.x = gridEnabled ? snapToGrid(rawX) : rawX;
      pos.y = gridEnabled ? snapToGrid(rawY) : rawY;
      pos.vx = 0;
      pos.vy = 0;
      bump((v) => v + 1);
    };
    const onUp = (ev: MouseEvent) => {
      const d = draggingRef.current;
      if (d) {
        if (moved) {
          pinnedRef.current.add(d.id);
          const finalPos = posRef.current.get(d.id);
          if (finalPos) {
            anchorRef.current.set(d.id, { x: finalPos.x, y: finalPos.y });
            onPersistPosition(d.id, finalPos.x, finalPos.y);
            // Small, gentle residual float — a fraction of the drag's average speed, capped
            // so a fast flick still only produces a soft drift, never a fling.
            const dt = Math.max(16, performance.now() - dragStartAt);
            const avgVx = ((ev.clientX - d.startClientX) / zoom / dt) * 16;
            const avgVy = ((ev.clientY - d.startClientY) / zoom / dt) * 16;
            const kickSpeed = Math.hypot(avgVx, avgVy);
            const maxKick = 2.5;
            const scale = kickSpeed > maxKick ? maxKick / kickSpeed : 1;
            finalPos.vx = avgVx * scale * 0.35;
            finalPos.vy = avgVy * scale * 0.35;
          }
        } else if (n.kind === "quest" && n.entryId) {
          if (d.openHandle) onOpenQuest(n.entryId);
        } else if (n.kind === "dialogue" && n.dialogueId) onOpenDialogue(n.dialogueId);
      }
      draggingRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const onBgPointerDown = (e: React.MouseEvent) => {
    panDragRef.current = { startClientX: e.clientX, startClientY: e.clientY, startPanX: pan.x, startPanY: pan.y };
    const onMove = (ev: MouseEvent) => {
      const d = panDragRef.current;
      if (!d) return;
      setPan({ x: d.startPanX + (ev.clientX - d.startClientX), y: d.startPanY + (ev.clientY - d.startClientY) });
    };
    const onUp = () => {
      panDragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const onWheel = (e: React.WheelEvent) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    const newZoom = clamp(zoom + (e.deltaY > 0 ? -0.08 : 0.08), MIN_ZOOM, 2.5);
    if (!rect || newZoom === zoom) {
      setZoom(newZoom);
      return;
    }
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const ratio = newZoom / zoom;
    setPan((p) => ({ x: mouseX - (mouseX - p.x) * ratio, y: mouseY - (mouseY - p.y) * ratio }));
    setZoom(newZoom);
  };

  // Auto-center + zoom-to-fit: bounding box of every node's CURRENT position (not the static
  // WIDTH/HEIGHT world canvas, which is much bigger than what's actually populated), so this
  // stays useful whether the graph has 3 quests or 80 of them. Min zoom lowered all the way to
  // 1% (MIN_ZOOM) so a very large/sprawling graph can still fit rather than clipping.
  const resetView = () => {
    const positions = Array.from(posRef.current.values());
    const rect = viewportRef.current?.getBoundingClientRect();
    if (positions.length === 0 || !rect || rect.width === 0) {
      setZoom(0.65);
      setPan({ x: 30, y: 20 });
      return;
    }
    const pad = 160;
    const minX = Math.min(...positions.map((p) => p.x)) - pad;
    const maxX = Math.max(...positions.map((p) => p.x)) + pad;
    const minY = Math.min(...positions.map((p) => p.y)) - pad;
    const maxY = Math.max(...positions.map((p) => p.y)) + pad;
    const boxW = Math.max(1, maxX - minX);
    const boxH = Math.max(1, maxY - minY);
    const fitZoom = clamp(Math.min(rect.width / boxW, rect.height / boxH), MIN_ZOOM, 2.5);
    setZoom(fitZoom);
    setPan({ x: rect.width / 2 - ((minX + maxX) / 2) * fitZoom, y: rect.height / 2 - ((minY + maxY) / 2) * fitZoom });
  };

  // Pan+zoom the viewport to bring a specific node into view, plus a couple of ripple rings
  // pulsing outward from its border so it's obvious at a glance which quest just got selected
  // (the pan/zoom alone can be subtle if the node was already mostly on screen). Used both for
  // the left list's "focus" action (via the focusRequest prop below) AND for clicking a
  // cross-chapter portal stub (see the portal rendering further down) — same navigation feel
  // either way.
  const focusNode = (nodeId: string) => {
    const p = posRef.current.get(nodeId);
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!p || !rect) return;
    const targetZoom = Math.max(zoom, 0.8);
    setZoom(targetZoom);
    setPan({ x: rect.width / 2 - p.x * targetZoom, y: rect.height / 2 - p.y * targetZoom });
    setHoveredId(nodeId);
    setRippleNodeId(nodeId);
    setTimeout(() => setRippleNodeId((cur) => (cur === nodeId ? null : cur)), 1000);
  };

  useEffect(() => {
    if (!focusRequest) return;
    focusNode(focusRequest.nodeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest]);

  // Full transitive closure over the edges graph (BFS in both directions), not just direct
  // one-hop neighbors — hovering a quest highlights its ENTIRE chain, ancestors and
  // descendants alike, "inheriting" down through however many hops it takes, instead of only
  // lighting up whichever single quest is directly adjacent to it.
  const connected = useMemo(() => {
    if (!hoveredId) return null;
    const adjacency = new Map<string, string[]>();
    for (const e of edges) {
      if (!adjacency.has(e.from)) adjacency.set(e.from, []);
      if (!adjacency.has(e.to)) adjacency.set(e.to, []);
      adjacency.get(e.from)!.push(e.to);
      adjacency.get(e.to)!.push(e.from);
    }
    const s = new Set<string>([hoveredId]);
    const queue = [hoveredId];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const next of adjacency.get(cur) ?? []) {
        if (!s.has(next)) {
          s.add(next);
          queue.push(next);
        }
      }
    }
    return s;
  }, [hoveredId, edges]);

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const entryById = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);

  const pos = posRef.current;

  // Cross-chapter dependency edges — drawing one long line straight across chapter swimlanes
  // fights the swimlane force in tick() (the two nodes visibly drag each other into the wrong
  // band). Instead, each end gets a small "portal" stub docked right next to the REAL node:
  // the source gets an arrow to a stub labeled with the target's name+chapter (colored by the
  // target's own status), and the target gets a matching stub docked to its left labeled with
  // the source's name+chapter (colored by the source's status) — click either to jump straight
  // to the real node it names, with the same pan+ripple as the left list's focus action.
  const PORTAL_HALF_W = 72;
  const PORTAL_GAP = 20;
  const PORTAL_STACK_GAP = 48;
  interface Portal {
    key: string;
    anchorNodeId: string;
    side: "out" | "in";
    targetNodeId: string;
    label: string;
    chapterLabel: string;
    color: string;
    x: number;
    y: number;
  }
  const portalGroups = new Map<string, Omit<Portal, "x" | "y">[]>();
  const pushPortal = (groupKey: string, portal: Omit<Portal, "x" | "y">) => {
    if (!portalGroups.has(groupKey)) portalGroups.set(groupKey, []);
    portalGroups.get(groupKey)!.push(portal);
  };
  for (const e of edges) {
    if (!e.styleKind) continue; // only real quest->quest dependency edges (unlocks/blocks)
    if (!e.from.startsWith("q:") || !e.to.startsWith("q:")) continue;
    const fromQ = e.from.slice(2);
    const toQ = e.to.slice(2);
    const chFrom = chapterKeyByQuestId.get(fromQ);
    const chTo = chapterKeyByQuestId.get(toQ);
    if (chFrom === undefined || chTo === undefined || chFrom === chTo) continue;
    const fromNode = nodeById.get(e.from);
    const toNode = nodeById.get(e.to);
    const fromStatus = statuses.get(fromQ) ?? "available";
    const toStatus = statuses.get(toQ) ?? "available";
    pushPortal(`${e.from}:out`, {
      key: `${e.from}->${e.to}:out`,
      anchorNodeId: e.from,
      side: "out",
      targetNodeId: e.to,
      label: toNode?.label ?? toQ,
      chapterLabel: chTo || "Без главы",
      color: statusColor(toStatus, toNode?.color ?? "#888"),
    });
    pushPortal(`${e.to}:in`, {
      key: `${e.from}->${e.to}:in`,
      anchorNodeId: e.to,
      side: "in",
      targetNodeId: e.from,
      label: fromNode?.label ?? fromQ,
      chapterLabel: chFrom || "Без главы",
      color: statusColor(fromStatus, fromNode?.color ?? "#888"),
    });
  }
  const portals: Portal[] = [];
  for (const list of portalGroups.values()) {
    const anchorPos = pos.get(list[0].anchorNodeId);
    if (!anchorPos) continue;
    const dir = list[0].side === "out" ? 1 : -1;
    list.forEach((portal, i) => {
      const stackOffset = (i - (list.length - 1) / 2) * PORTAL_STACK_GAP;
      portals.push({
        ...portal,
        x: anchorPos.x + dir * (REAL_HALF_W + PORTAL_GAP + PORTAL_HALF_W),
        y: anchorPos.y + stackOffset,
      });
    });
  }
  const crossChapterEdgeKeys = crossChapterEdgeSet;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--op-10)] shrink-0">
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setZoom((z) => clamp(z - 0.15, MIN_ZOOM, 2.5))} className="w-7 h-7 grid place-items-center rounded-md glass hover:bg-[var(--op-10)]">
            <ZoomOut size={13} />
          </button>
          <span className="text-xs mono text-[var(--op-40)] w-12 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => clamp(z + 0.15, MIN_ZOOM, 2.5))} className="w-7 h-7 grid place-items-center rounded-md glass hover:bg-[var(--op-10)]">
            <ZoomIn size={13} />
          </button>
          <button onClick={resetView} title="Сбросить вид (авто-центровка)" className="w-7 h-7 grid place-items-center rounded-md glass hover:bg-[var(--op-10)]">
            <Maximize2 size={13} />
          </button>
          <button
            data-tour="quests-grid-toggle"
            onClick={() => onSetGridEnabled(!gridEnabled)}
            title={gridEnabled ? "Сетка и привязка: вкл" : "Сетка и привязка: выкл"}
            className={`w-7 h-7 grid place-items-center rounded-md glass hover:bg-[var(--op-10)] ${gridEnabled ? "text-accent bg-accent/10" : ""}`}
          >
            <Grid2X2 size={13} />
          </button>
        </div>
      </div>
      <div
        ref={viewportRef}
        data-tour="quests-graph"
        className="flex-1 relative overflow-hidden cursor-grab active:cursor-grabbing"
        style={{ background: "radial-gradient(circle at center, var(--op-5), transparent 70%)" }}
        onWheel={onWheel}
        onMouseDown={onBgPointerDown}
      >
        {nodes.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-[var(--op-30)] gap-2">
            <ScrollText size={28} />
            <div className="text-sm">Нет квестов — добавьте их в Codex, чтобы увидеть карту связей.</div>
          </div>
        ) : (
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: WIDTH,
              height: HEIGHT,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "0 0",
            }}
          >
            {chapterOrder.map((key) => {
              const band = chapterBand.get(key);
              if (!band) return null;
              const color = chapterColor(key);
              return (
                <ChapterFrame
                  key={`chband-${key}`}
                  chapterKey={key}
                  band={band}
                  color={color}
                  zoom={zoom}
                  minWidth={chapterMinWidth.get(key) ?? 320}
                  minHeight={band.autoHeight}
                  onResize={(w) => onSetChapterWidth(key, w)}
                  onResizeHeight={(h) => onSetChapterHeight(key, h)}
                />
              );
            })}
            {gridEnabled && (
              <div
                className="absolute pointer-events-none"
                style={{
                  left: chapterAreaBounds.left,
                  top: chapterAreaBounds.top,
                  width: chapterAreaBounds.width,
                  height: chapterAreaBounds.height,
                  backgroundImage:
                    "linear-gradient(to right, var(--op-8) 1px, transparent 1px), linear-gradient(to bottom, var(--op-8) 1px, transparent 1px)",
                  backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
                  // Keep the grid lines aligned to world-space (not restarting at 0,0 of this
                  // cropped box), so cells line up with the same grid a node would snap to
                  // regardless of where the chapter area's bounding box happens to start.
                  backgroundPosition: `${-chapterAreaBounds.left}px ${-chapterAreaBounds.top}px`,
                }}
              />
            )}
            <svg width={WIDTH} height={HEIGHT} className="absolute inset-0 pointer-events-none" style={{ overflow: "visible" }}>
              <defs>
                {/* markerUnits="strokeWidth" (not the previous fixed "userSpaceOnUse") so the
                    arrowhead scales WITH the line's own thickness automatically — thin 1.4px
                    "проверяет" edges and thick 5px dependency "ropes" each get a proportional
                    arrow instead of the same fixed 8px triangle looking oversized on thin
                    lines and undersized/misaligned on thick ones. */}
                <marker id="quest-graph-arrow" viewBox="0 0 8 8" markerWidth="5" markerHeight="5" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
                  <path d="M0,0 L8,4 L0,8 Z" fill="var(--op-30)" />
                </marker>
                <marker id="quest-graph-arrow-green" viewBox="0 0 8 8" markerWidth="5" markerHeight="5" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
                  <path d="M0,0 L8,4 L0,8 Z" fill="#7cc98a" />
                </marker>
                <marker id="quest-graph-arrow-red" viewBox="0 0 8 8" markerWidth="5" markerHeight="5" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
                  <path d="M0,0 L8,4 L0,8 Z" fill="#e0716f" />
                </marker>
              </defs>
              {edges.map((e, i) => {
                if (crossChapterEdgeKeys.has(`${e.from}->${e.to}`)) return null;
                const a = pos.get(e.from);
                const b = pos.get(e.to);
                if (!a || !b) return null;
                const dim = connected && !(connected.has(e.from) && connected.has(e.to));
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const nx = dx / dist;
                const ny = dy / dist;
                // Quest cards are much bigger than the small circular dialogue/flag nodes, AND
                // rectangular rather than circular — rectEdgePoint finds exactly where the line
                // crosses each end's real bounding box, then EDGE_GAP pushes the trimmed point
                // back by the same small amount on both ends, so there's always one consistent
                // gap before the card starts, from any angle, on either side.
                const EDGE_GAP = 8;
                const fromIsQuest = nodeById.get(e.from)?.kind === "quest";
                const toIsQuest = nodeById.get(e.to)?.kind === "quest";
                const fromHalf = fromIsQuest ? { w: REAL_HALF_W, h: 78 } : { w: 26, h: 26 };
                const toHalf = toIsQuest ? { w: REAL_HALF_W, h: 78 } : { w: 26, h: 26 };
                const fromEdge = rectEdgePoint(b, a, fromHalf.w, fromHalf.h);
                const toEdge = rectEdgePoint(a, b, toHalf.w, toHalf.h);
                const x1 = fromEdge.x + nx * EDGE_GAP;
                const y1 = fromEdge.y + ny * EDGE_GAP;
                const x2 = toEdge.x - nx * EDGE_GAP;
                const y2 = toEdge.y - ny * EDGE_GAP;
                const mx = (a.x + b.x) / 2;
                const my = (a.y + b.y) / 2;

                // Dependency edges (unlocks/blocks) all share the same visual STYLE — a diagonal
                // barber-pole hazard stripe — the colors are what tell them apart: pending
                // (source quest not yet done) sits static in the source quest's own card color;
                // once the source completes, an "unlocks" edge turns green and starts flowing,
                // while a "blocks" edge turns red (the now-blocked target's status color) and
                // also flows — motion reads as "this is live now", stillness as "not yet".
                let patternId: string | null = null;
                let patternColor = "var(--op-30)";
                let animated = false;
                let labelColor = "var(--op-60)";
                if (e.styleKind) {
                  const sourceNode = nodeById.get(e.from);
                  const targetNode = nodeById.get(e.to);
                  // Same pending-cascade override as the card render above — an edge leading
                  // OUT of a quest that's still visually showing "completed" (its own revert
                  // hasn't landed yet) should keep flowing/green too, not desync from its source.
                  const sourceStatus = sourceNode?.entryId
                    ? cascadeSnapshotRef.current.has(sourceNode.entryId)
                      ? "completed"
                      : statuses.get(sourceNode.entryId)
                    : undefined;
                  const sourceDone = sourceStatus === "completed";
                  patternId = `quest-dep-stripe-${i}`;
                  if (e.styleKind === "block" && sourceDone) {
                    patternColor = targetNode ? statusColor("blocked", targetNode.color) : "#e0716f";
                    animated = true;
                  } else if (sourceDone) {
                    patternColor = "#7cc98a";
                    animated = true;
                  } else {
                    patternColor = sourceNode ? statusColor(sourceStatus ?? "available", sourceNode.color) : "#cda559";
                    animated = false;
                  }
                  labelColor = patternColor;
                }
                // The stripe pattern tiles are drawn diagonally in the PATTERN's own local
                // space, which is fixed to the SVG's world axes — without correcting for it, a
                // horizontal edge and a vertical edge show completely different-looking stripe
                // angles even though they're meant to be the same "rope" motif. Rotating the
                // pattern to match each edge's own angle keeps the stripe direction consistent
                // relative to the line itself, the way a real twisted rope reads the same
                // regardless of which way it's laid down.
                const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
                return (
                  <g key={i} opacity={dim ? 0.1 : 0.9} className="transition-opacity duration-300">
                    {e.styleKind && patternId && (
                      <pattern
                        id={patternId}
                        width="20"
                        height="20"
                        patternUnits="userSpaceOnUse"
                        patternTransform={`rotate(${angleDeg})`}
                        style={{ color: patternColor }}
                      >
                        <rect width="20" height="20" fill="#221515" />
                        <path d="M-5,20 L5,0 L15,0 L5,20 Z" fill="currentColor" />
                        <path d="M15,20 L25,0 L35,0 L25,20 Z" fill="currentColor" />
                        {animated && (
                          <animateTransform
                            attributeName="patternTransform"
                            type="translate"
                            from="0 0"
                            to="20 0"
                            dur="0.8s"
                            repeatCount="indefinite"
                            additive="sum"
                          />
                        )}
                      </pattern>
                    )}
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={e.styleKind && patternId ? `url(#${patternId})` : "var(--op-30)"}
                      strokeWidth={e.styleKind ? 5 : 1.4}
                      // "butt" (not "round") specifically because these lines always terminate
                      // at an arrowhead marker — a round cap bulges the stroke half its own
                      // width PAST the geometric endpoint in the line's direction, which is
                      // what made the thick 5px "rope" edges visually poke out past their own
                      // arrowhead tip instead of ending cleanly at it.
                      strokeLinecap="butt"
                      style={{ transition: "stroke 0.3s ease" }}
                      markerEnd={
                        e.styleKind === "block" && animated
                          ? "url(#quest-graph-arrow-red)"
                          : animated
                          ? "url(#quest-graph-arrow-green)"
                          : "url(#quest-graph-arrow)"
                      }
                    />
                    {e.note && (
                      <g transform={`translate(${mx}, ${my})`}>
                        <rect
                          x={-Math.min(90, e.note.length * 3.6 + 8)}
                          y={-9}
                          width={Math.min(180, e.note.length * 7.2 + 16)}
                          height={18}
                          rx={5}
                          fill="var(--popover-bg)"
                          stroke="var(--popover-border)"
                          strokeWidth={1}
                        />
                        <text x={0} y={4} textAnchor="middle" fontSize={10} fill={e.styleKind ? labelColor : "var(--op-60)"} className="mono">
                          {e.note}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
              {portals.map((p) => {
                const a = pos.get(p.anchorNodeId);
                if (!a) return null;
                // "out" (attached to the source): arrow runs FROM the real node TO the portal
                // stub, same reading direction as a normal dependency edge. "in" (attached to
                // the child, docked on its left): arrow runs FROM the portal stub INTO the real
                // node — it's the arrival end of the same relationship, just drawn as its own
                // short stub instead of one long line crossing chapters.
                const x1 = p.side === "out" ? a.x + REAL_HALF_W : p.x + PORTAL_HALF_W + 6;
                const x2 = p.side === "out" ? p.x - PORTAL_HALF_W - 6 : a.x - REAL_HALF_W;
                const y1 = p.side === "out" ? a.y : p.y;
                const y2 = p.side === "out" ? p.y : a.y;
                const markerId = `portal-arrow-${p.key.replace(/[^a-zA-Z0-9]/g, "_")}`;
                return (
                  <g key={p.key} opacity={0.85}>
                    <defs>
                      <marker id={markerId} viewBox="0 0 8 8" markerWidth="5" markerHeight="5" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
                        <path d="M0,0 L8,4 L0,8 Z" fill={p.color} />
                      </marker>
                    </defs>
                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={p.color} strokeWidth={1.8} strokeDasharray="5 4" markerEnd={`url(#${markerId})`} />
                  </g>
                );
              })}
            </svg>

            {nodes.map((n) => {
              const p = pos.get(n.id);
              if (!p) return null;
              const dim = connected && !connected.has(n.id);
              const wrapperStyle: React.CSSProperties = {
                position: "absolute",
                left: p.x,
                top: p.y,
                transform: "translate(-50%, -50%)",
                opacity: dim ? 0.25 : 1,
              };

              if (n.kind === "quest" && n.entryId) {
                // While a cascade-revert is pending for this quest (see cascadeSnapshotRef in
                // the effect above), keep rendering its FROZEN pre-revert entry/status instead
                // of the live ones — the live `statuses` map already flipped this quest to
                // "locked" the instant the root toggle changed (that computation is a pure,
                // synchronous function of the whole dependency graph), but this specific card
                // shouldn't visually catch up until its own staggered timer actually lands.
                const pendingEntry = cascadeSnapshotRef.current.get(n.entryId);
                const entry = pendingEntry ?? entryById.get(n.entryId);
                const status = pendingEntry ? "completed" : statuses.get(n.entryId) ?? "available";
                // Reflect the DERIVED status on the toggle, not just the raw manual set — a
                // quest whose objectives are all finished should show as "on" even before
                // anyone touches its toggle.
                const on = status === "completed";
                return (
                  <div
                    key={n.id}
                    onMouseDown={(ev) => onNodePointerDown(n, ev)}
                    onMouseEnter={() => {
                      if (draggingRef.current) return;
                      setHoveredId(n.id);
                    }}
                    onMouseLeave={() => {
                      if (draggingRef.current) return;
                      setHoveredId(null);
                    }}
                    style={wrapperStyle}
                    className="cursor-pointer select-none group transition-opacity duration-300"
                    title={n.label}
                  >
                    <QuestNodeCard
                      entry={entry}
                      label={n.label}
                      color={n.color}
                      status={status}
                      on={on}
                      onToggle={() => onToggleCompleted(n.entryId!)}
                      onSetAllObjectives={(done) => onSetAllObjectives(n.entryId!, done)}
                      onToggleObjective={(i) => onToggleObjective(n.entryId!, i)}
                      entryById={entryById}
                      questDialogueLinks={n.entryId ? dialogueLinks.byQuest.get(n.entryId) : undefined}
                      objectiveDialogueLinks={dialogueLinks.byObjective}
                      flagDefs={flagDefs}
                      onSetObjectiveValue={(i, v) => onSetObjectiveValue(n.entryId!, i, v)}
                      zoom={zoom}
                    />
                    {blockFlash.has(n.id) && (
                      <div
                        className={`absolute inset-0 grid place-items-center pointer-events-none transition-opacity duration-500 ${
                          blockFlash.get(n.id) === "out" ? "opacity-0" : "opacity-100"
                        }`}
                      >
                        <div
                          className="w-10 h-10 rounded-full grid place-items-center border-2"
                          style={{
                            background: "rgba(224, 113, 111, 0.18)",
                            borderColor: "#e0716f",
                            boxShadow: "0 0 16px rgba(224, 113, 111, 0.35)",
                            animation: blockFlash.get(n.id) === "in" ? "quest-block-pop 0.28s cubic-bezier(0.34, 1.56, 0.64, 1)" : undefined,
                          }}
                        >
                          <X size={20} strokeWidth={3} style={{ color: "#e0716f" }} />
                        </div>
                      </div>
                    )}
                    {rippleNodeId === n.id && (
                      <div className="absolute -inset-1.5 pointer-events-none rounded-lg">
                        <div className="quest-focus-ripple absolute inset-0 rounded-lg border-2" style={{ borderColor: n.color }} />
                        <div className="quest-focus-ripple-2 absolute inset-0 rounded-lg border-2" style={{ borderColor: n.color }} />
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <div
                  key={n.id}
                  onMouseDown={(ev) => onNodePointerDown(n, ev)}
                  onMouseEnter={() => {
                    if (draggingRef.current) return;
                    setHoveredId(n.id);
                  }}
                  onMouseLeave={() => {
                    if (draggingRef.current) return;
                    setHoveredId(null);
                  }}
                  style={wrapperStyle}
                  className="flex flex-col items-center gap-1 cursor-pointer select-none group"
                  title={n.label}
                >
                  <div
                    className="w-10 h-10 rounded-full grid place-items-center border-2 shadow-lg transition-transform group-hover:scale-110 pointer-events-none"
                    style={{ background: "var(--popover-bg)", borderColor: n.color, color: n.color }}
                  >
                    <NodeIcon n={n} />
                  </div>
                  <span
                    className="text-[11px] px-1.5 py-0.5 rounded whitespace-nowrap max-w-[130px] truncate"
                    style={{ background: "var(--popover-bg)", color: "var(--op-80)" }}
                  >
                    {n.label}
                  </span>
                </div>
              );
            })}

            {portals.map((p) => (
              <button
                key={p.key}
                onClick={(ev) => {
                  ev.stopPropagation();
                  focusNode(p.targetNodeId);
                }}
                onMouseDown={(ev) => ev.stopPropagation()}
                title={`Перейти к «${p.label}» (${p.chapterLabel})`}
                className="absolute rounded-lg border-2 px-2.5 py-2 text-left shadow-lg cursor-pointer hover:scale-[1.04] transition-transform"
                style={{
                  left: p.x,
                  top: p.y,
                  width: PORTAL_HALF_W * 2,
                  transform: "translate(-50%, -50%)",
                  background: "var(--popover-bg)",
                  borderColor: p.color,
                  borderStyle: "dashed",
                }}
              >
                <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider" style={{ color: p.color }}>
                  {p.side === "out" ? <ArrowUpRight size={10} /> : <ArrowDownLeft size={10} />}
                  {p.chapterLabel}
                </div>
                <div className="text-[11px] text-[var(--op-85)] truncate mt-0.5">{p.label}</div>
                {rippleNodeId === p.targetNodeId && (
                  <div className="absolute -inset-1.5 pointer-events-none rounded-lg">
                    <div className="quest-focus-ripple absolute inset-0 rounded-lg border-2" style={{ borderColor: p.color }} />
                    <div className="quest-focus-ripple-2 absolute inset-0 rounded-lg border-2" style={{ borderColor: p.color }} />
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- quest list (left panel) ----

function questTypeLabel(e: Entry): string {
  const t = e.questType ?? (e.category === "main_quest" ? "main" : "side");
  return t === "main" ? "Основной" : t === "story" ? "Сюжетный" : "Побочный";
}

function QuestListRow({
  entry,
  onOpen,
  onHover,
  status,
}: {
  entry: Entry;
  onOpen: (id: string) => void;
  onHover: (hovering: boolean) => void;
  status?: QuestStatus;
}) {
  const objectives = entry.objectives ?? [];
  const rewards = entry.rewards;
  const hasRewards = !!(rewards && (rewards.coins || rewards.xp || rewards.affinity || rewards.items?.length));
  const dotColor = status === "completed" ? "#7cc98a" : status === "blocked" ? "#e0716f" : status === "locked" ? "var(--op-40)" : undefined;
  return (
    <button
      onClick={() => onOpen(entry.id)}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-[var(--op-7)] transition-colors border border-transparent hover:border-[var(--op-10)] group"
    >
      <div className="flex items-center gap-2">
        {entry.category === "side_quest" ? (
          <Swords size={14} style={{ color: CAT_COLOR[entry.category] }} className="shrink-0" />
        ) : (
          <Flag size={14} style={{ color: CAT_COLOR[entry.category] }} className="shrink-0" />
        )}
        <span className="text-sm text-[var(--op-85)] truncate flex-1">{entry.name}</span>
        {status && status !== "available" && (
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0 transition-colors duration-300"
            style={{ background: dotColor }}
            title={STATUS_LABEL[status]}
          />
        )}
        <span className="text-[10px] mono text-[var(--op-35)] shrink-0">{questTypeLabel(entry)}</span>
      </div>
      {objectives.length > 0 && (
        <div className="mt-1 pl-6 text-[11px] text-[var(--op-40)] truncate">
          {objectives.length} {objectives.length === 1 ? "цель" : "целей"}
        </div>
      )}
      {hasRewards && (
        <div className="mt-1 pl-6 flex items-center gap-2.5 text-[11px] text-[var(--op-45)]">
          {!!rewards?.coins && (
            <span className="flex items-center gap-1">
              <Coins size={11} /> {rewards.coins}
            </span>
          )}
          {!!rewards?.xp && (
            <span className="flex items-center gap-1">
              <Sparkles size={11} /> {rewards.xp}
            </span>
          )}
          {!!rewards?.affinity && (
            <span className="flex items-center gap-1">
              <Heart size={11} /> {rewards.affinity}
            </span>
          )}
        </div>
      )}
    </button>
  );
}

// ---- GML export modal (compileQuestsScript) ----

function QuestsExportModal({ entries, onClose }: { entries: Entry[]; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const code = useMemo(() => {
    try {
      return { code: compileQuestsScript(entries), error: null as string | null };
    } catch (e: any) {
      return { code: "", error: e?.message ?? String(e) };
    }
  }, [entries]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const download = () => {
    const blob = new Blob([code.code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "quests_init.gml";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 grid place-items-center p-4" onMouseDown={onClose}>
      <div
        className="glass rounded-xl flex flex-col overflow-hidden relative"
        style={{ width: Math.min(900, window.innerWidth - 80), height: Math.min(700, window.innerHeight - 80) }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--op-10)] shrink-0">
          <div className="text-sm font-medium text-[var(--op-85)]">Экспорт в GML — quests_init()</div>
          <div className="flex-1" />
          {!code.error && (
            <button onClick={copy} className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-accent/80 hover:bg-accent">
              {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Скопировано" : "Копировать"}
            </button>
          )}
          {!code.error && (
            <button onClick={download} className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md glass hover:bg-[var(--op-10)]">
              <Download size={13} /> .gml
            </button>
          )}
          <button onClick={onClose} className="w-8 h-8 grid place-items-center rounded-md glass hover:bg-[var(--op-10)]">
            <X size={14} />
          </button>
        </div>
        {code.error ? (
          <div className="p-4 text-xs text-red-400">{code.error}</div>
        ) : (
          <textarea
            readOnly
            value={code.code}
            className="flex-1 m-4 p-3 rounded-md bg-black/40 border border-[var(--op-10)] text-[11px] mono text-[var(--op-80)] resize-none outline-none"
            onFocus={(e) => e.currentTarget.select()}
          />
        )}
      </div>
    </div>
  );
}

// ---- main view ----

export function QuestsView() {
  const openEntry = useProjectStore((s) => s.openEntry);
  const showDialogues = useProjectStore((s) => s.showDialogues);
  const setActiveDialogue = useProjectStore((s) => s.setActiveDialogue);
  const project = useProjectStore((s) => s.project);
  const entries = useProjectStore((s) => s.project.entries);
  const updateEntry = useProjectStore((s) => s.updateEntry);
  const dialogues = useProjectStore((s) => s.project.dialogues);
  const setQuestGraphPosition = useProjectStore((s) => s.setQuestGraphPosition);
  const setQuestGraphGridEnabled = useProjectStore((s) => s.setQuestGraphGridEnabled);
  const setQuestChapterWidth = useProjectStore((s) => s.setQuestChapterWidth);
  const setQuestChapterHeight = useProjectStore((s) => s.setQuestChapterHeight);
  const dialogueFlagDefs = useProjectStore((s) => s.project.dialogueFlagDefs);
  const { nodes, edges, quests } = useQuestRoadmap();
  const dialogueLinks = useDialogueQuestLinks(quests, dialogues);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [flagsOpen, setFlagsOpen] = useState(false);
  const [focusRequest, setFocusRequest] = useState<{ nodeId: string; token: number } | null>(null);
  const [listCategoryFilter, setListCategoryFilter] = useState<"all" | "main_quest" | "side_quest">("all");
  const [listSearch, setListSearch] = useState("");
  // "What if this quest were completed?" — a purely local, ephemeral simulation (not tied to
  // any real save data), used ONLY for quests with no objectives at all (nothing else to
  // represent "done" with). Quests that DO have objectives are driven by their real,
  // persisted current/max data instead — see setAllObjectivesDone/toggleObjective below.
  const [simCompleted, setSimCompleted] = useState<Set<string>>(new Set());
  const toggleCompleted = (questId: string) =>
    setSimCompleted((prev) => {
      const next = new Set(prev);
      if (next.has(questId)) next.delete(questId);
      else next.add(questId);
      return next;
    });
  const statuses = useMemo(() => computeQuestStatuses(quests, simCompleted), [quests, simCompleted]);

  // Real, persisted objective edits — clicking a subtask checkbox on a quest card, or flipping
  // the quest's own "пройден" toggle when it has objectives, writes straight back to the entry
  // (via updateEntry) instead of just simulating, since objectives are genuine Codex data.
  const toggleObjective = (entryId: string, index: number) => {
    const entry = entries.find((e) => e.id === entryId);
    const o = entry?.objectives?.[index];
    if (!o) return;
    const max = o.max ?? 1;
    const current = o.current ?? (o.done ? 1 : 0);
    const nextDone = current < max;
    const nextObjectives = entry!.objectives!.map((obj, i) => (i === index ? { ...obj, current: nextDone ? max : 0, done: nextDone } : obj));
    updateEntry(entryId, { objectives: nextObjectives });
  };
  const setAllObjectivesDone = (entryId: string, done: boolean) => {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry?.objectives?.length) return;
    const nextObjectives = entry.objectives.map((o) => ({ ...o, current: done ? o.max ?? 1 : 0, done }));
    updateEntry(entryId, { objectives: nextObjectives });
  };
  // Slider objectives (valueMode "flag"/number or "custom"/number) write an arbitrary value
  // directly instead of just toggling between 0 and max — see the DialogueLinkDot-adjacent
  // range input in QuestNodeCard.
  const setObjectiveValue = (entryId: string, index: number, value: number) => {
    const entry = entries.find((e) => e.id === entryId);
    const o = entry?.objectives?.[index];
    if (!o) return;
    const { max } = objectiveDisplayMode(o, dialogueFlagDefs);
    const clamped = Math.max(0, Math.min(max, Math.round(value)));
    const nextObjectives = entry!.objectives!.map((obj, i) => (i === index ? { ...obj, current: clamped, done: clamped >= max } : obj));
    updateEntry(entryId, { objectives: nextObjectives });
  };

  const openDialogue = (id: string) => {
    showDialogues();
    setActiveDialogue(id);
  };

  // Clicking a quest in the left list used to open the full entry editor — now it pans/centers
  // the roadmap graph on that quest's node instead, staying inside this window (per the
  // "не открывать полный редактор записи" requirement). The full editor is still one click away
  // from the node card itself (its icon/title) or the Gallery, so nothing is actually lost.
  const focusQuestNode = (questId: string) => setFocusRequest({ nodeId: `q:${questId}`, token: Date.now() });

  const searchNorm = listSearch.trim().toLowerCase();
  const filteredQuests = quests.filter((q) => {
    if (listCategoryFilter !== "all" && q.category !== listCategoryFilter) return false;
    if (searchNorm && !q.name.toLowerCase().includes(searchNorm)) return false;
    return true;
  });
  const chapterGroups = useMemo(() => {
    const byChapter = new Map<string, Entry[]>();
    for (const q of filteredQuests) {
      const key = q.chapter && project.chapters.includes(q.chapter) ? q.chapter : "";
      if (!byChapter.has(key)) byChapter.set(key, []);
      byChapter.get(key)!.push(q);
    }
    for (const list of byChapter.values()) list.sort((a, b) => a.name.localeCompare(b.name, "ru"));
    const ordered: { label: string; quests: Entry[] }[] = [];
    for (const ch of project.chapters) {
      const list = byChapter.get(ch);
      if (list?.length) ordered.push({ label: ch, quests: list });
    }
    const noChapter = byChapter.get("");
    if (noChapter?.length) ordered.push({ label: "Без главы", quests: noChapter });
    return ordered;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredQuests, project.chapters]);

  return (
    <div className="h-full flex overflow-hidden">
      <ResizablePanel panelKey="quests-list" side="left" defaultWidth={280} min={220} max={440}>
      <div className="h-full flex flex-col border-r border-[var(--op-10)] overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-4 border-b border-[var(--op-10)] shrink-0">
          <ScrollText size={18} className="text-[var(--op-70)]" />
          <span className="text-lg font-medium text-[#ece4d2]">Квесты</span>
          <Flag size={12} className="text-[var(--op-45)] shrink-0" />
          <span className="text-xs text-[var(--op-45)]">Флаги</span>
          <button
            onClick={() => setFlagsOpen(true)}
            title="Открыть менеджер флагов диалогов"
            className="w-6 h-6 shrink-0 grid place-items-center rounded-md glass hover:bg-[var(--op-10)] text-[var(--op-60)]"
          >
            <ToggleLeft size={13} />
          </button>
          <Tour tourId="quests" steps={QUESTS_TOUR} />
          <span className="text-xs mono text-[var(--op-30)] bg-[var(--op-5)] border border-[var(--op-10)] rounded-full px-2 py-0.5 ml-auto">
            {filteredQuests.length}/{quests.length}
          </span>
        </div>
        <div data-tour="quests-search" className="px-3 pt-3 pb-1 space-y-2 shrink-0">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--op-35)]" />
            <input
              value={listSearch}
              onChange={(e) => setListSearch(e.target.value)}
              placeholder="Поиск квеста…"
              className="input text-xs py-1.5 pl-7"
            />
          </div>
          <div className="flex items-center gap-1">
            {(
              [
                ["all", "Все"],
                ["main_quest", "Основные"],
                ["side_quest", "Побочные"],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setListCategoryFilter(val)}
                className={`flex-1 text-[10px] py-1 rounded-md border transition-colors ${
                  listCategoryFilter === val
                    ? "bg-accent/80 border-accent text-[var(--popover-bg)]"
                    : "border-[var(--op-10)] text-[var(--op-45)] hover:bg-[var(--op-6)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div data-tour="quests-list" className="flex-1 min-h-0 overflow-y-auto p-2 space-y-3">
          {quests.length === 0 ? (
            <div className="p-4 text-sm text-[var(--op-35)] text-center">
              Нет квестов. Создайте запись категории «Основные квесты» или «Побочные квесты» в Галерее.
            </div>
          ) : chapterGroups.length === 0 ? (
            <div className="p-4 text-sm text-[var(--op-35)] text-center">Ничего не найдено.</div>
          ) : (
            chapterGroups.map((group) => (
              <div key={group.label}>
                <div className="px-2 pb-1 text-[11px] uppercase tracking-wider text-[var(--op-35)]">{group.label}</div>
                <div className="space-y-0.5">
                  {group.quests.map((q) => (
                    <QuestListRow
                      key={q.id}
                      entry={q}
                      onOpen={focusQuestNode}
                      onHover={(h) => setHoveredId(h ? `q:${q.id}` : null)}
                      status={statuses.get(q.id)}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
        <div className="p-2 border-t border-[var(--op-10)] shrink-0">
          <button
            onClick={() => setExportOpen(true)}
            className="w-full flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-md glass hover:bg-[var(--op-10)] text-[var(--op-70)]"
          >
            <Download size={13} /> Экспорт GML (quests_init)
          </button>
        </div>
      </div>
      </ResizablePanel>

      <div className="flex-1 min-w-0 h-full flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--op-10)] shrink-0">
          <div className="text-sm text-[var(--op-45)]">
            Карта влияния — как квесты, диалоги и флаги связаны друг с другом. Наведите на узел, чтобы подсветить связи;
            кликните по квесту или диалогу, чтобы открыть его. Переключатель на карточке квеста — симуляция «что если этот
            квест пройден»: <span style={{ color: "#7cc98a" }}>зелёные</span> связи показывают, что откроется, а{" "}
            <span style={{ color: "#e0716f" }}>красные</span> — что заблокируется.
          </div>
        </div>
        <div className="flex-1 min-h-0">
          <RoadmapGraph
            nodes={nodes}
            edges={edges}
            onOpenQuest={openEntry}
            onOpenDialogue={openDialogue}
            hoveredId={hoveredId}
            setHoveredId={setHoveredId}
            entries={entries}
            statuses={statuses}
            simCompleted={simCompleted}
            onToggleCompleted={toggleCompleted}
            onSetAllObjectives={setAllObjectivesDone}
            onToggleObjective={toggleObjective}
            dialogueLinks={dialogueLinks}
            savedPositions={project.questGraphPositions ?? {}}
            onPersistPosition={setQuestGraphPosition}
            focusRequest={focusRequest}
            flagDefs={dialogueFlagDefs}
            onSetObjectiveValue={setObjectiveValue}
            chapters={project.chapters}
            gridEnabled={project.questGraphGridEnabled ?? false}
            onSetGridEnabled={setQuestGraphGridEnabled}
            savedChapterWidths={project.questGraphChapterWidths ?? {}}
            onSetChapterWidth={setQuestChapterWidth}
            savedChapterHeights={project.questGraphChapterHeights ?? {}}
            onSetChapterHeight={setQuestChapterHeight}
          />
        </div>
      </div>

      {exportOpen && <QuestsExportModal entries={entries} onClose={() => setExportOpen(false)} />}
      {flagsOpen && <FlagsManagerModal onClose={() => setFlagsOpen(false)} />}
    </div>
  );
}
