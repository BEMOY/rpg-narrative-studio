import type { Dialogue, DialogueChoice, DialogueLine, DialogueNode } from "../types/database";
import { nextId } from "./mapDefaults";

export function createLine(partial?: Partial<DialogueLine>): DialogueLine {
  return {
    id: nextId("line"),
    speaker: "",
    side: "default",
    emotion: "",
    text: "",
    noSkip: false,
    ...partial,
  };
}

export function createChoice(partial?: Partial<DialogueChoice>): DialogueChoice {
  return {
    id: nextId("choice"),
    text: "",
    flagSets: [],
    questActions: [],
    ...partial,
  };
}

export function createNode(x: number, y: number, partial?: Partial<DialogueNode>): DialogueNode {
  return {
    id: nextId("node"),
    x,
    y,
    lines: [createLine()],
    choices: [],
    ...partial,
  };
}

export function createDialogue(name: string, folderId: string | null): Dialogue {
  const startNode = createNode(80, 80);
  return {
    id: nextId("dlg"),
    name,
    folderId,
    startNodeId: startNode.id,
    nodes: [startNode],
  };
}

// Backward compatibility: fills in anything missing so older saved dialogues never crash
// newer UI (same discipline as normalizeMap() for the map editor).
export function normalizeDialogue(raw: Dialogue): Dialogue {
  const nodes = (raw.nodes ?? []).map((n) => ({
    ...n,
    lines: (n.lines ?? []).map((l) => ({ ...l, side: l.side ?? "default", noSkip: l.noSkip ?? false })),
    choices: (n.choices ?? []).map((c) => ({ ...c, flagSets: c.flagSets ?? [], questActions: c.questActions ?? [] })),
  }));
  return {
    ...raw,
    nodes,
    startNodeId: raw.startNodeId && nodes.some((n) => n.id === raw.startNodeId) ? raw.startNodeId : nodes[0]?.id ?? "",
  };
}
