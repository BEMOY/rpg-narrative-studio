// v77 — the project-wide reverse-reference index ("живые обратные связи" from the vision):
// given one Entry, find every place in the project that actually USES it — dialogues it speaks
// in or is checked/granted by, quests that reward it or depend on it, scenes it's staged in,
// cutscenes it acts in, maps it stands on or that lead to it, and plain manual references from
// other entries. Consumed by the UsageSection on every entry card (EntryDetail) and by the
// Inspector's compact list; every row is clickable and navigates straight to where the usage
// lives. Computed on demand (a linear scan) rather than kept as a live index — project sizes
// here are hundreds of entities, not millions, and a scan is trivially correct after any edit.

import type { Dialogue, Entry, Project } from "../types/database";

export interface Usage {
  // Where to navigate when clicked.
  target: { kind: "entry"; id: string } | { kind: "dialogue"; id: string };
  label: string; // the using thing's display name
  detail: string; // in what ROLE this entry is used there, e.g. "говорит в 3 репликах"
  group: UsageGroup;
}

export type UsageGroup = "dialogues" | "quests" | "scenes" | "cutscenes" | "maps" | "references";

export const USAGE_GROUP_LABEL: Record<UsageGroup, string> = {
  dialogues: "Диалоги",
  quests: "Квесты",
  scenes: "Сцены",
  cutscenes: "Катсцены",
  maps: "Карты",
  references: "Ссылки",
};

function dialogueRoles(d: Dialogue, id: string): string[] {
  const roles: string[] = [];
  let speaks = 0;
  let conditions = 0;
  let actions = 0;
  for (const n of d.nodes) {
    for (const l of n.lines) {
      if (l.speakerEntryId === id) speaks++;
      if (l.condition && (l.condition.kind === "entry" || l.condition.kind === "quest") && l.condition.key === id) conditions++;
      for (const qa of l.questActions ?? []) if (qa.questId === id) actions++;
    }
    for (const c of n.choices) {
      if (c.condition && (c.condition.kind === "entry" || c.condition.kind === "quest") && c.condition.key === id) conditions++;
      for (const qa of c.questActions ?? []) if (qa.questId === id) actions++;
    }
  }
  if (speaks > 0) roles.push(`говорит (${speaks} репл.)`);
  if (conditions > 0) roles.push(`условие (${conditions})`);
  if (actions > 0) roles.push(`квест-действие (${actions})`);
  return roles;
}

export function findUsages(project: Project, entryId: string): Usage[] {
  const usages: Usage[] = [];
  const byId = new Map(project.entries.map((e) => [e.id, e]));

  // -- dialogues: speaker / condition subject / quest action target --
  for (const d of project.dialogues) {
    const roles = dialogueRoles(d, entryId);
    if (roles.length > 0) {
      usages.push({ target: { kind: "dialogue", id: d.id }, label: d.name, detail: roles.join(" · "), group: "dialogues" });
    }
    // a dialogue "happens at" a location
    if (d.locationEntryId === entryId) {
      usages.push({ target: { kind: "dialogue", id: d.id }, label: d.name, detail: "место действия", group: "dialogues" });
    }
  }

  for (const e of project.entries) {
    if (e.id === entryId) continue;

    // -- quests: reward item / dependency --
    if (e.category === "main_quest" || e.category === "side_quest") {
      if ((e.rewards?.items ?? []).some((it) => it.id === entryId)) {
        usages.push({ target: { kind: "entry", id: e.id }, label: e.name, detail: "награда квеста", group: "quests" });
      }
      for (const dep of e.questDependencies ?? []) {
        if (dep.questId === entryId) {
          usages.push({
            target: { kind: "entry", id: e.id },
            label: e.name,
            detail: dep.kind === "unlocks" ? "открывает этот квест" : "блокирует этот квест",
            group: "quests",
          });
        }
      }
    }

    // -- scenes: bound location / flow step refs / scene handoffs --
    if (e.category === "scene") {
      if (e.sceneMapId === entryId) {
        usages.push({ target: { kind: "entry", id: e.id }, label: e.name, detail: "локация сцены", group: "scenes" });
      }
      const stepKinds = (e.sceneFlow ?? []).filter((s) => s.refId === entryId).map((s) => s.kind);
      if (stepKinds.length > 0) {
        usages.push({ target: { kind: "entry", id: e.id }, label: e.name, detail: `шаг сцены (${stepKinds.join(", ")})`, group: "scenes" });
      }
      if ((e.sceneTransitions ?? []).some((t) => t.targetSceneId === entryId)) {
        usages.push({ target: { kind: "entry", id: e.id }, label: e.name, detail: "передаёт сюжет в эту сцену", group: "scenes" });
      }
    }

    // -- cutscenes: cast member / bound map / event targets --
    if (e.category === "cutscene") {
      const roles: string[] = [];
      if ((e.cutsceneCast ?? []).some((c) => c.entryId === entryId)) roles.push("актёр на сцене");
      if (e.cutsceneMapId === entryId) roles.push("фоновая карта");
      for (const tr of e.cutsceneTracks ?? []) {
        for (const clip of tr.clips) {
          const comp = clip.component;
          if (comp.kind === "event") {
            if (comp.objectId === entryId) roles.push(comp.eventKind === "destroyObject" ? "уничтожается событием" : "спавнится событием");
            if (comp.battleId === entryId) roles.push("запускается битва");
            if (comp.targetMapId === entryId) roles.push("телепорт на эту карту");
          }
        }
      }
      if (roles.length > 0) {
        usages.push({ target: { kind: "entry", id: e.id }, label: e.name, detail: [...new Set(roles)].join(" · "), group: "cutscenes" });
      }
    }

    // -- maps: placed as an object / transition leads to this location --
    if (e.category === "location" && e.map) {
      const roles: string[] = [];
      let placed = 0;
      for (const layer of e.map.layers) {
        if (layer.kind === "object") placed += layer.objects.filter((o) => o.entryId === entryId).length;
        if (layer.kind === "zone") {
          for (const z of layer.zones) if (z.tag === "transition" && z.targetMapId === entryId) roles.push(`переход «${z.label || "дверь"}»`);
        }
      }
      if (placed > 0) roles.unshift(placed === 1 ? "размещён на карте" : `размещён на карте ×${placed}`);
      if (roles.length > 0) {
        usages.push({ target: { kind: "entry", id: e.id }, label: e.name, detail: roles.join(" · "), group: "maps" });
      }
    }

    // -- plain manual references (Entry.references) --
    if ((e.references ?? []).includes(entryId)) {
      usages.push({
        target: { kind: "entry", id: e.id },
        label: e.name,
        detail: e.referenceNotes?.[entryId] || "упоминает в связях",
        group: "references",
      });
    }
  }

  // Starting inventory–style references FROM this entry are already visible on its own card;
  // this index is strictly "who uses ME". Keep group order stable for rendering.
  void byId;
  return usages;
}

export function groupUsages(usages: Usage[]): Map<UsageGroup, Usage[]> {
  const order: UsageGroup[] = ["dialogues", "quests", "scenes", "cutscenes", "maps", "references"];
  const map = new Map<UsageGroup, Usage[]>();
  for (const g of order) {
    const list = usages.filter((u) => u.group === g);
    if (list.length > 0) map.set(g, list);
  }
  return map;
}
