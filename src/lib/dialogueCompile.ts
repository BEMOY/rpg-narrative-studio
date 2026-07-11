// Compiles a Dialogue (our editor's node/choice graph) into real GameMaker GML matching the
// exact runtime format used by obj_dialogue / scr_dialogue in the user's project: one or more
// `dialogue_register("<id>", function() { return [ ...pages... ]; });` calls, where a page is
// a plain struct ({ speaker, text, side, emotion, unskippable, choices }) and a choice's
// `action` is a closure that either returns a NEW nested pages array (continues inline) or
// `flag_set("goto_dialogue", "<id>"); return undefined;` to hand off to another registered
// dialogue (used for shared/converging branches and cycles) — see the user's own "farewell"
// example, which is the reference this compiler was designed against.
//
// Key rules (confirmed against the pasted engine source + the user's answers):
//  - A node's `choices` (if any) are attached to the LAST page of that node only — the engine
//    triggers the choice menu as soon as that page's text finishes typing.
//  - `continueTo` (linear, no-choices link) is ALWAYS inlined/duplicated into the same pages
//    array — there is no per-continuation action hook to jump dialogues at that point in the
//    real engine, so looping purely via continuations (no choice anywhere in the loop) is a
//    hard error we surface to the author instead of silently infinite-looping the compiler.
//  - A choice's target becomes its OWN `dialogue_register` block (reached via
//    flag_set("goto_dialogue", ...)) when: it's the dialogue's start node, it's targeted by
//    more than one choice anywhere in the dialogue, or picking it would re-enter a node already
//    on the current inlining path (a cycle reached via a choice edge).
//  - side:"default" omits the `side` key entirely (lets the registered speaker's own default
//    side apply); left/right/none are exported literally.
//  - Quest conditions -> quest_status("<id>") ==/!= "<value>". Entry has/not_has ->
//    item_has("<id>") / !item_has("<id>"). Flag conditions -> flag_get("<key>") ==/!= <value>.

import type { Dialogue, DialogueChoice, DialogueCondition, DialogueLine, Entry } from "../types/database";

function slugify(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || "x";
}

function gmlString(raw: string): string {
  return (
    '"' +
    String(raw ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\r\n|\r|\n/g, "\\n") +
    '"'
  );
}

// Heuristic literal export for flag values / flag-condition comparisons: true/false and
// plain numbers are emitted unquoted (matching the user's own example, e.g.
// `flag_set("helped_test", true)`), everything else is exported as a quoted GML string.
function gmlValue(raw: string): string {
  const t = (raw ?? "").trim();
  if (/^(true|false)$/i.test(t)) return t.toLowerCase();
  if (t !== "" && Number.isFinite(Number(t))) return t;
  return gmlString(raw ?? "");
}

const FALLBACK_STUB_LINE: DialogueLine = {
  id: "stub",
  speaker: "",
  side: "default",
  text: "",
  noSkip: false,
};

export function compileDialogueToGML(dialogue: Dialogue, entries: Entry[]): string {
  const nodesById = new Map(dialogue.nodes.map((n) => [n.id, n]));
  if (!dialogue.startNodeId || !nodesById.has(dialogue.startNodeId)) {
    throw new Error(`У диалога «${dialogue.name}» не задан (или сломан) стартовый узел — экспорт невозможен.`);
  }

  // Static in-degree via CHOICE edges only (continuations never split into separate blocks).
  const choiceInDegree = new Map<string, number>();
  for (const n of dialogue.nodes) {
    for (const c of n.choices) {
      if (c.targetNodeId && nodesById.has(c.targetNodeId)) {
        choiceInDegree.set(c.targetNodeId, (choiceInDegree.get(c.targetNodeId) ?? 0) + 1);
      }
    }
  }

  const dialogueSlug = slugify(dialogue.name);
  const roots = new Set<string>([dialogue.startNodeId]);
  for (const [id, count] of choiceInDegree) if (count > 1) roots.add(id);

  const slugFor = new Map<string, string>([[dialogue.startNodeId, dialogueSlug]]);
  let autoIdx = 1;
  function nameFor(id: string): string {
    if (!slugFor.has(id)) slugFor.set(id, `${dialogueSlug}_${autoIdx++}`);
    return slugFor.get(id)!;
  }
  for (const id of roots) nameFor(id);

  const queued = new Set<string>([dialogue.startNodeId]);
  const queue: string[] = [dialogue.startNodeId];

  function indent(depth: number): string {
    return "    ".repeat(depth);
  }

  function speakerSlug(line: DialogueLine): string | undefined {
    if (line.speakerEntryId) {
      const e = entries.find((x) => x.id === line.speakerEntryId || x.uuid === line.speakerEntryId);
      if (e) return slugify(e.id);
    }
    return line.speaker && line.speaker.trim() ? slugify(line.speaker) : undefined;
  }

  function renderCondition(cond: DialogueCondition | undefined): string | undefined {
    if (!cond || !cond.key || !cond.key.trim()) return undefined;
    if (cond.kind === "flag") {
      const op = cond.op === "neq" ? "!=" : "==";
      return `function() { return flag_get(${gmlString(cond.key)}) ${op} ${gmlValue(cond.value ?? "")}; }`;
    }
    if (cond.kind === "quest") {
      const op = cond.op === "neq" ? "!=" : "==";
      return `function() { return quest_status(${gmlString(cond.key)}) ${op} ${gmlString(cond.value ?? "active")}; }`;
    }
    const call = `item_has(${gmlString(cond.key)})`;
    return `function() { return ${cond.op === "not_has" ? "!" + call : call}; }`;
  }

  function renderLinePage(line: DialogueLine, depth: number): string {
    const speaker = speakerSlug(line);
    const parts: string[] = [];
    if (speaker) parts.push(`speaker:${gmlString(speaker)}`);
    parts.push(`text:${gmlString(line.text)}`);
    if (line.side && line.side !== "default") parts.push(`side:${gmlString(line.side)}`);
    if (line.emotion && line.emotion.trim()) parts.push(`emotion:${gmlString(line.emotion)}`);
    if (line.noSkip) parts.push("unskippable:true");
    return `${indent(depth)}{ ${parts.join(", ")} }`;
  }

  function renderChoice(choice: DialogueChoice, path: Set<string>, depth: number): string {
    const fields: string[] = [`text:${gmlString(choice.text)}`];
    const cond = renderCondition(choice.condition);
    if (cond) fields.push(`condition: ${cond}`);

    const actionLines: string[] = [];
    for (const fs of choice.flagSets) {
      if (!fs.key.trim()) continue;
      actionLines.push(`flag_set(${gmlString(fs.key)}, ${gmlValue(fs.value)});`);
    }

    const targetId = choice.targetNodeId;
    if (!targetId || !nodesById.has(targetId)) {
      actionLines.push("return undefined;");
    } else if (roots.has(targetId) || path.has(targetId)) {
      // Shared/converging branch, or a cycle reached via a choice edge: hand off to its own
      // registered dialogue instead of inlining (matches the user's own "farewell" example).
      if (!queued.has(targetId)) {
        queued.add(targetId);
        queue.push(targetId);
      }
      actionLines.push(`flag_set("goto_dialogue", ${gmlString(nameFor(targetId))});`);
      actionLines.push("return undefined;");
    } else {
      actionLines.push(`return ${renderPagesArrayLiteral(targetId, path, depth + 1)};`);
    }

    const actionBody = actionLines.map((l) => `${indent(depth + 1)}${l}`).join("\n");
    fields.push(`action: function() {\n${actionBody}\n${indent(depth)}}`);
    return `${indent(depth)}{ ${fields.join(", ")} }`;
  }

  function buildPageObjects(nodeId: string, path: Set<string>, depth: number): string[] {
    if (path.has(nodeId)) {
      const node = nodesById.get(nodeId);
      throw new Error(
        `Обнаружен цикл через «продолжение» (без выбора) в узле «${node?.lines[0]?.text?.slice(0, 30) || nodeId}» диалога «${dialogue.name}». ` +
          `У ноды без выборов нет способа вернуться назад — добавьте туда хотя бы один выбор, чтобы разорвать цикл.`
      );
    }
    const node = nodesById.get(nodeId);
    if (!node) return [];
    const nextPath = new Set(path);
    nextPath.add(nodeId);

    const lines = node.lines.length > 0 ? node.lines : [FALLBACK_STUB_LINE];
    const pageStrs = lines.map((l) => renderLinePage(l, depth));

    if (node.choices.length > 0) {
      const choicesCode = node.choices.map((c) => renderChoice(c, nextPath, depth + 1)).join(",\n");
      const last = pageStrs[pageStrs.length - 1];
      pageStrs[pageStrs.length - 1] = `${last.slice(0, -2)}, choices: [\n${choicesCode}\n${indent(depth)}] }`;
      return pageStrs;
    }
    if (node.continueTo && nodesById.has(node.continueTo)) {
      return [...pageStrs, ...buildPageObjects(node.continueTo, nextPath, depth)];
    }
    return pageStrs;
  }

  function renderPagesArrayLiteral(nodeId: string, path: Set<string>, depth: number): string {
    const objs = buildPageObjects(nodeId, path, depth + 1);
    if (objs.length === 0) return "[]";
    return `[\n${objs.join(",\n")}\n${indent(depth)}]`;
  }

  const registeredBlocks: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    const pagesLiteral = renderPagesArrayLiteral(id, new Set(), 1);
    registeredBlocks.push(
      `dialogue_register(${gmlString(nameFor(id))}, function() {\n${indent(1)}return ${pagesLiteral};\n});`
    );
  }

  const header =
    `// Сгенерировано RPG Narrative Studio — диалог «${dialogue.name}».\n` +
    `// Перед вставкой в scr_dialogue_content проверьте:\n` +
    `//  1) ключи спикеров (speaker) совпадают с ключами в global.speakers (speaker_define);\n` +
    `//  2) id квестов/объектов совпадают с тем, что принимают ваши quest_status()/item_has();\n` +
    `//  3) flag_set("goto_dialogue", ...) в вашем проекте обрабатывается так же, как в вашем\n` +
    `//     собственном примере с "farewell" — если механизм другой, поправьте вручную.\n`;

  return header + "\n" + registeredBlocks.join("\n\n") + "\n";
}
