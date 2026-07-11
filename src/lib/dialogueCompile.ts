// Compiles a Dialogue (our editor's node/choice graph) into real GameMaker GML matching the
// exact runtime format used by obj_dialogue / scr_dialogue in the user's project.
//
// Two export shapes are supported, both producing pages built the same way:
//  - "register": one or more `dialogue_register("<id>", function() { return [...]; });` calls
//    — shared/converging branches (or cycles reached via a choice) get split into their own
//    block, reached via `flag_set("goto_dialogue", "<id>"); return undefined;` (exactly the
//    pattern in the user's own "farewell" example).
//  - "lines": a single bare `lines = [ ... ];` array (matching the two NPC Create-event
//    snippets the user pasted for making an NPC talkable) — there is no dialogue_register
//    wrapper to hand off to here, so every choice target is inlined/duplicated in place; a
//    genuine cycle (reachable again via nodes already on the current path) is a hard error
//    telling the author to use "register" mode instead.
//
// A third export, compileSpeakersScript(), generates a speakers_init()-equivalent script from
// Character entries' "Диалог" tab data (mirrors scr_dialogue_data / speaker_define), filling
// in placeholders for anything left blank so it's always safe to export.
//
// Key rules (confirmed against the pasted engine source + the user's answers):
//  - A node's `choices` (if any) are attached to the LAST page of that node only — the engine
//    triggers the choice menu as soon as that page's text finishes typing.
//  - `continueTo` (linear, no-choices link) is ALWAYS inlined/duplicated — there is no
//    per-continuation action hook to jump dialogues in the real engine.
//  - side:"default" omits the `side` key entirely; left/right/none are exported literally.
//  - Quest conditions -> quest_state("<id>") based checks (not_started/active/done). Entry has/not_has ->
//    item_has("<id>") / !item_has("<id>"). Flag conditions -> flag_get("<key>") ==/!= <value>.

import type { Dialogue, DialogueChoice, DialogueColorStyle, DialogueCondition, DialogueLine, Entry, QuestAction } from "../types/database";

export function slugify(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || "x";
}

export function gmlString(raw: string): string {
  return (
    '"' +
    String(raw ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\r\n|\r|\n/g, "\\n") +
    '"'
  );
}

// Heuristic literal export for flag values / flag-condition comparisons: true/false and plain
// numbers are emitted unquoted (matching the user's own example, e.g. flag_set("x", true)),
// everything else is exported as a quoted GML string.
export function gmlValue(raw: string): string {
  const t = (raw ?? "").trim();
  if (/^(true|false)$/i.test(t)) return t.toLowerCase();
  if (t !== "" && Number.isFinite(Number(t))) return t;
  return gmlString(raw ?? "");
}

// For fields that are usually a bare GML identifier/constant (color constants like c_white,
// sprite/sound asset names) but might occasionally be a literal the author typed some other
// way (a hex color, something with spaces) — emit unquoted when it looks like a valid GML
// identifier or number, quoted otherwise.
export function gmlBareOrQuoted(raw: string): string {
  const t = (raw ?? "").trim();
  if (/^-?[A-Za-z_][A-Za-z0-9_]*$/.test(t) || /^-?\d+(\.\d+)?$/.test(t)) return t;
  return gmlString(raw ?? "");
}

function indent(depth: number): string {
  return "    ".repeat(depth);
}

const FALLBACK_STUB_LINE: DialogueLine = { id: "stub", speaker: "", side: "default", text: "", noSkip: false };

export function characterSpeakerKey(entry: Entry): string {
  return slugify(entry.id);
}

function speakerSlug(line: DialogueLine, entries: Entry[]): string | undefined {
  if (line.speakerEntryId) {
    const e = entries.find((x) => x.id === line.speakerEntryId || x.uuid === line.speakerEntryId);
    if (e) return characterSpeakerKey(e);
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
    return renderQuestCondition(cond.key, cond.op === "neq" ? "neq" : "eq", cond.value ?? "active");
  }
  const call = `item_has(${gmlString(cond.key)})`;
  return `function() { return ${cond.op === "not_has" ? "!" + call : call}; }`;
}

// Quest conditions check the REAL, live quest_state() (updated by quest_start/quest_progress/
// quest_check_complete) rather than the separate, simpler flag-based quest_status() helper —
// picking the mechanism that stays in sync with the quest actions (start/advance/complete)
// dialogue choices can trigger below, per the user's own confirmation.
function renderQuestCondition(key: string, op: "eq" | "neq", value: string): string {
  const idLit = gmlString(key);
  const negate = op === "neq";
  if (value === "not_started") {
    const check = `quest_state(${idLit}) == undefined`;
    return `function() { return ${negate ? `!(${check})` : check}; }`;
  }
  const status = value === "done" ? "completed" : "active";
  const check = `_qs != undefined && _qs.status == ${gmlString(status)}`;
  return `function() { var _qs = quest_state(${idLit}); return ${negate ? `!(${check})` : check}; }`;
}

// Direct quest_start/quest_progress/quest_mark_done calls a choice can trigger — these are
// real, confirmed function names from scr_quests.gml, called directly rather than through any
// flag-based convention (unlike goto_dialogue, which genuinely is flag-driven).
function renderQuestActionLines(actions: QuestAction[] | undefined): string[] {
  const lines: string[] = [];
  for (const qa of actions ?? []) {
    if (!qa.questId.trim()) continue;
    const idLit = gmlString(qa.questId);
    if (qa.kind === "start") lines.push(`quest_start(${idLit});`);
    else if (qa.kind === "complete") lines.push(`quest_mark_done(${idLit});`);
    else lines.push(`quest_progress(${idLit}, ${qa.objectiveIndex ?? 0}, ${qa.amount ?? 1});`);
  }
  return lines;
}

function renderLinePage(line: DialogueLine, entries: Entry[], depth: number): string {
  const speaker = speakerSlug(line, entries);
  const parts: string[] = [];
  if (speaker) parts.push(`speaker:${gmlString(speaker)}`);
  parts.push(`text:${gmlString(line.text)}`);
  if (line.side && line.side !== "default") parts.push(`side:${gmlString(line.side)}`);
  if (line.emotion && line.emotion.trim()) parts.push(`emotion:${gmlString(line.emotion)}`);
  if (line.noSkip) parts.push("unskippable:true");
  return `${indent(depth)}{ ${parts.join(", ")} }`;
}

// ---------------------------------------------------------------------------------
// "register" mode — dialogue_register(...) blocks, shared branches split off via goto_dialogue
// ---------------------------------------------------------------------------------

export function compileDialogueToGML(dialogue: Dialogue, entries: Entry[]): string {
  const nodesById = new Map(dialogue.nodes.map((n) => [n.id, n]));
  if (!dialogue.startNodeId || !nodesById.has(dialogue.startNodeId)) {
    throw new Error(`У диалога «${dialogue.name}» не задан (или сломан) стартовый узел — экспорт невозможен.`);
  }

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

  function renderChoice(choice: DialogueChoice, path: Set<string>, depth: number): string {
    const fields: string[] = [`text:${gmlString(choice.text)}`];
    const cond = renderCondition(choice.condition);
    if (cond) fields.push(`condition: ${cond}`);

    const actionLines: string[] = [];
    for (const fs of choice.flagSets) {
      if (!fs.key.trim()) continue;
      actionLines.push(`flag_set(${gmlString(fs.key)}, ${gmlValue(fs.value)});`);
    }
    actionLines.push(...renderQuestActionLines(choice.questActions));

    const targetId = choice.targetNodeId;
    if (!targetId || !nodesById.has(targetId)) {
      actionLines.push("return undefined;");
    } else if (roots.has(targetId) || path.has(targetId)) {
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
      throw new Error(
        `Обнаружен цикл через «продолжение» (без выбора) в узле «${nodeId}» диалога «${dialogue.name}». ` +
          `У ноды без выборов нет способа вернуться назад — добавьте туда хотя бы один выбор, чтобы разорвать цикл.`
      );
    }
    const node = nodesById.get(nodeId);
    if (!node) return [];
    const nextPath = new Set(path);
    nextPath.add(nodeId);

    const lines = node.lines.length > 0 ? node.lines : [FALLBACK_STUB_LINE];
    const pageStrs = lines.map((l) => renderLinePage(l, entries, depth));

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
    registeredBlocks.push(`dialogue_register(${gmlString(nameFor(id))}, function() {\n${indent(1)}return ${pagesLiteral};\n});`);
  }

  const header =
    `// Сгенерировано RPG Narrative Studio — диалог «${dialogue.name}» (режим dialogue_register).\n` +
    `// Перед вставкой в scr_dialogue_content проверьте:\n` +
    `//  1) ключи спикеров (speaker) совпадают с ключами в global.speakers (speaker_define) —\n` +
    `//     см. соседнюю вкладку «speakers-скрипт», если персонажи ещё не зарегистрированы;\n` +
    `//  2) id квестов совпадают с entry.id в Codex — условие проверяет quest_state(); id предметов — item_has();\n` +
    `//  3) flag_set("goto_dialogue", ...) в вашем проекте обрабатывается так же, как в вашем\n` +
    `//     собственном примере с "farewell" — если механизм другой, поправьте вручную.\n`;

  return header + "\n" + registeredBlocks.join("\n\n") + "\n";
}

// ---------------------------------------------------------------------------------
// "lines" mode — bare `lines = [...]`, everything inlined (matches the pasted NPC snippets)
// ---------------------------------------------------------------------------------

export function compileDialogueToLines(dialogue: Dialogue, entries: Entry[]): string {
  const nodesById = new Map(dialogue.nodes.map((n) => [n.id, n]));
  if (!dialogue.startNodeId || !nodesById.has(dialogue.startNodeId)) {
    throw new Error(`У диалога «${dialogue.name}» не задан (или сломан) стартовый узел — экспорт невозможен.`);
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
    actionLines.push(...renderQuestActionLines(choice.questActions));

    const targetId = choice.targetNodeId;
    if (!targetId || !nodesById.has(targetId)) {
      actionLines.push("return undefined;");
    } else if (path.has(targetId)) {
      throw new Error(
        `Обнаружен цикл через выбор, ведущий обратно к узлу «${targetId}» диалога «${dialogue.name}». ` +
          `Формат «lines» не поддерживает переход между диалогами (нет dialogue_register) — либо уберите цикл, ` +
          `либо используйте режим «dialogue_register», где такие ветки решаются через flag_set("goto_dialogue", ...).`
      );
    } else {
      actionLines.push(`return ${renderPagesArrayLiteral(targetId, path, depth + 1)};`);
    }

    const actionBody = actionLines.map((l) => `${indent(depth + 1)}${l}`).join("\n");
    fields.push(`action: function() {\n${actionBody}\n${indent(depth)}}`);
    return `${indent(depth)}{ ${fields.join(", ")} }`;
  }

  function buildPageObjects(nodeId: string, path: Set<string>, depth: number): string[] {
    if (path.has(nodeId)) {
      throw new Error(
        `Обнаружен цикл через «продолжение» (без выбора) в узле «${nodeId}» диалога «${dialogue.name}». ` +
          `Добавьте туда хотя бы один выбор, чтобы разорвать цикл.`
      );
    }
    const node = nodesById.get(nodeId);
    if (!node) return [];
    const nextPath = new Set(path);
    nextPath.add(nodeId);

    const lines = node.lines.length > 0 ? node.lines : [FALLBACK_STUB_LINE];
    const pageStrs = lines.map((l) => renderLinePage(l, entries, depth));

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

  const header =
    `// Сгенерировано RPG Narrative Studio — диалог «${dialogue.name}» (режим lines).\n` +
    `// Вставьте в Create event NPC (как в ваших примерах) — весь диалог самодостаточен,\n` +
    `// общие ветки продублированы инлайн, так как этот формат не использует dialogue_register.\n`;

  const body = `lines = ${renderPagesArrayLiteral(dialogue.startNodeId, new Set(), 0)};`;
  return header + "\n" + body + "\n";
}

// ---------------------------------------------------------------------------------
// colors script — colors_init()-equivalent generated from the project's registered color
// styles (mirrors global.colors[$ name] = {...}, consumed by the user's own color_lookup() /
// color_eval() / color_eval_glyph()). [c=name] tags in exported dialogue text just pass the
// name through as a string, so this script is what actually makes those names resolve in-game.
// ---------------------------------------------------------------------------------

function gmlColorLiteral(hex: string): string {
  const h = (hex || "#ffffff").replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : (h + "ffffff").slice(0, 6);
  const num = parseInt(full, 16) || 0xffffff;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `make_colour_rgb(${r}, ${g}, ${b})`;
}

export function compileColorStylesScript(styles: DialogueColorStyle[]): string {
  const header =
    "// Сгенерировано RPG Narrative Studio — аналог инициализации global.colors для\n" +
    "// color_lookup()/color_eval()/color_eval_glyph(). Ключи — это то же имя, что в [c=имя]\n" +
    "// тегах экспортированных диалогов, так что оба экспорта всегда согласованы.\n\n";

  if (styles.length === 0) {
    return (
      header +
      "function colors_init() {\n" +
      "    global.colors = {};\n" +
      "    // Пока нет зарегистрированных стилей — добавьте их в разделе «Стили» редактора диалогов.\n" +
      "}\n"
    );
  }

  const lines = styles.map((s) => {
    const parts: string[] = [`mode: ${gmlString(s.mode)}`];
    if (s.mode !== "rainbow") parts.push(`a: ${gmlColorLiteral(s.a)}`);
    if (s.mode === "gradient" || s.mode === "pulse" || s.mode === "gradient_anim") parts.push(`b: ${gmlColorLiteral(s.b)}`);
    if (s.mode !== "solid" && s.mode !== "gradient") parts.push(`speed: ${s.speed}`);
    return `    global.colors[$ ${gmlString(s.name)}] = { ${parts.join(", ")} };`;
  });

  return header + "function colors_init() {\n    global.colors = {};\n\n" + lines.join("\n") + "\n}\n";
}

// ---------------------------------------------------------------------------------
// speakers script — speakers_init()-equivalent generated from Character entries' "Диалог" tab
// ---------------------------------------------------------------------------------

export function compileSpeakersScript(entries: Entry[]): string {
  const characters = entries.filter((e) => e.category === "character");

  const blocks = characters.map((e) => {
    const data = e.dialogueSpeaker;
    const key = characterSpeakerKey(e);
    const displayName = data?.displayName?.trim() || e.name || key;
    const portraits =
      data?.portraits && data.portraits.length > 0
        ? data.portraits.filter((p) => p.emotion.trim())
        : [{ emotion: "neutral", sprite: "" }];
    const portraitFields = portraits
      .map((p) => `${p.emotion.trim() || "neutral"}: ${gmlBareOrQuoted(p.sprite.trim() || `spr_port_${key}_${slugify(p.emotion || "neutral")}`)}`)
      .join(", ");
    const color = gmlBareOrQuoted(data?.color?.trim() || "c_white");
    const blip = gmlBareOrQuoted(data?.blip?.trim() || "-1");
    const side = data?.side && data.side !== "default" ? data.side : "left";
    const textSpeed = data?.textSpeed ?? 0.3;
    const box = gmlBareOrQuoted(data?.box?.trim() || "spr_dlg_box");

    return (
      `    speaker_define(${gmlString(key)}, {\n` +
      `        display_name : ${gmlString(displayName)},\n` +
      `        portraits    : { ${portraitFields} },\n` +
      `        color        : ${color},\n` +
      `        blip         : ${blip},\n` +
      `        side         : ${gmlString(side)},\n` +
      `        text_speed   : ${textSpeed},\n` +
      `        box          : ${box}\n` +
      `    });`
    );
  });

  const header =
    `// Сгенерировано RPG Narrative Studio — аналог scr_dialogue_data / speakers_init().\n` +
    `// Ключи спикеров — это entry.id персонажей из Codex; они же используются в поле\n` +
    `// speaker при экспорте диалогов, так что оба экспорта всегда согласованы друг с другом.\n` +
    `// Пустые поля заполнены плейсхолдерами — замените спрайты/звуки на свои GameMaker-ассеты.\n\n` +
    `function speakers_init() {\n` +
    `    global.speakers = {};\n` +
    `    global.dlg_default_box = spr_dlg_box;   // фон окна по умолчанию — замените на свой спрайт\n` +
    `    global.dlg_denied_sound = -1;           // звук отказа — замените на свой sound-ассет (-1 = без звука)\n\n`;

  const footer = `\n}\n`;

  if (blocks.length === 0) {
    return (
      header +
      `    // Пока нет персонажей категории "Character" — добавьте их в Codex, чтобы здесь появились speaker_define(...).` +
      footer
    );
  }

  return header + blocks.join("\n\n") + footer;
}
