// Compiles Codex quest entries (main_quest/side_quest categories) into a quests_init()
// equivalent matching the user's own scr_quests.gml exactly:
//   quest_define("<id>", { title, desc, type, objectives: undefined | [{text,current,max,objid?}], rewards: undefined | {coins?,xp?,affinity?,items?:[{id,count}]} });
// Ids, field names, and the objectives/rewards shapes are taken verbatim from the pasted
// source — no guessing involved here, unlike the dialogue/speaker exporters.

import type { DialogueFlagDef, Entry, Objective, QuestRewards } from "../types/database";
import { isQuest } from "../types/database";
import { slugify, gmlString } from "./dialogueCompile";

export function objectiveProgress(o: Objective): { current: number; max: number } {
  return { current: o.current ?? (o.done ? 1 : 0), max: o.max ?? 1 };
}

// Resolves an objective's editing/display mode into a concrete "is this a checkbox or a
// slider, and what's the effective max" — used by both the entry editor (EntryEditor.tsx) and
// the quest node card (QuestsView.tsx) so the two stay perfectly in sync. `valueMode` is only
// a Codex planning aid (see its own doc comment in types/database.ts); legacy objectives with
// no valueMode at all fall back to "checkbox" so old saved projects keep behaving exactly as
// before this feature existed.
export function objectiveDisplayMode(
  o: Objective,
  flagDefs: Record<string, DialogueFlagDef>
): { kind: "checkbox" | "slider"; max: number } {
  const mode = o.valueMode ?? "checkbox";
  if (mode === "flag" && o.boundFlagName) {
    const def = flagDefs[o.boundFlagName];
    if (def?.type === "number") return { kind: "slider", max: Math.max(1, def.max ?? 100) };
    return { kind: "checkbox", max: 1 };
  }
  if (mode === "custom") {
    if (o.customType === "number") return { kind: "slider", max: Math.max(1, o.max ?? 100) };
    return { kind: "checkbox", max: 1 };
  }
  return { kind: "checkbox", max: o.max ?? 1 };
}

function renderObjectives(objectives: Objective[] | undefined): string {
  if (!objectives || objectives.length === 0) return "undefined";
  const rows = objectives.map((o) => {
    const { current, max } = objectiveProgress(o);
    const parts = [`text:${gmlString(o.text)}`, `current:${current}`, `max:${max}`];
    if (o.objId && o.objId.trim()) parts.push(`objid:${gmlString(o.objId.trim())}`);
    return `            { ${parts.join(", ")} },`;
  });
  return `[\n${rows.join("\n")}\n        ]`;
}

function renderRewards(rewards: QuestRewards | undefined): string {
  if (!rewards) return "undefined";
  const parts: string[] = [];
  if (rewards.coins != null) parts.push(`coins:${rewards.coins}`);
  if (rewards.xp != null) parts.push(`xp:${rewards.xp}`);
  if (rewards.affinity != null) parts.push(`affinity:${rewards.affinity}`);
  if (rewards.items && rewards.items.length > 0) {
    const items = rewards.items
      .filter((it) => it.id.trim())
      .map((it) => `{id:${gmlString(it.id)}, count:${it.count}}`)
      .join(", ");
    parts.push(`items:[${items}]`);
  }
  if (parts.length === 0) return "undefined";
  return `{ ${parts.join(", ")} }`;
}

export function compileQuestsScript(entries: Entry[]): string {
  const quests = entries.filter((e) => isQuest(e.category));

  const header =
    "// Сгенерировано RPG Narrative Studio — аналог quests_init() из вашего scr_quests.\n" +
    "// Id квестов — это entry.id из Codex; их же используют условия/действия в экспорте диалогов\n" +
    "// (quest_state, quest_start, quest_progress, quest_mark_done), так что всё согласовано.\n\n";

  if (quests.length === 0) {
    return header + "function quests_init() {\n    global.quests = {};\n    // Пока нет квестов в Codex.\n}\n";
  }

  const blocks = quests.map((e) => {
    const id = slugify(e.id);
    const type = e.questType ?? (e.category === "main_quest" ? "main" : "side");
    const deps = e.questDependencies ?? [];
    // Dependencies are a Codex-only planning aid (see the Квесты roadmap tab) — there's no
    // matching field in the real quest_define(), so they're surfaced here only as a comment,
    // never as generated code.
    const depComment =
      deps.length > 0
        ? `        // при завершении: ${deps.map((d) => `${d.kind === "unlocks" ? "открывает" : "блокирует"} "${slugify(d.questId)}"`).join(", ")}\n`
        : "";
    return (
      `    quest_define(${gmlString(id)}, {\n` +
      depComment +
      `        title:${gmlString(e.name)},\n` +
      `        desc:${gmlString(e.description)},\n` +
      `        type:${gmlString(type)},\n` +
      `        objectives: ${renderObjectives(e.objectives)},\n` +
      `        rewards: ${renderRewards(e.rewards)}\n` +
      `    });`
    );
  });

  return header + "function quests_init() {\n    global.quests = {};\n\n" + blocks.join("\n\n") + "\n}\n";
}
