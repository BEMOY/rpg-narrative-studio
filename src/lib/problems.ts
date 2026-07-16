// Project-wide validation scan for the IDE shell's bottom "Problems" panel (see BottomHub.tsx).
// Deliberately conservative/heuristic — false positives are worse than a missed edge case for
// a panel the writer is expected to check often, so every rule here only fires on something
// concretely checkable from data that exists today. A few checks described in the original
// "Dynarain" vision (e.g. "оружие без мини-игры") aren't implementable yet because that data
// doesn't exist in the schema until the Battle/Minigame phase lands — see the equipment sprite
// check below for the closest real equivalent available right now.
import type { Project } from "../types/database";
import { isQuest, isEquip } from "../types/database";
import { estimateDialogueOverflow, resolvePreviewSettings } from "./dialoguePreview";

export type ProblemTarget = { kind: "entry"; id: string } | { kind: "dialogue"; id: string };

export interface Problem {
  id: string;
  message: string;
  target: ProblemTarget;
}

// A dialogue node is a natural ending if it has nothing left to do — no choices and no
// continueTo — matching exactly how TestPlayModal.tsx already renders "Конец диалога". A
// dialogue with NO reachable ending at all (every path from the start loops back into itself
// forever) is what this check flags — not "missing continueTo", which is the normal, intended
// way a conversation ends.
function dialogueHasNoReachableEnding(
  nodes: { id: string; choices: { targetNodeId?: string }[]; continueTo?: string; lines: { elseNodeId?: string }[] }[],
  startNodeId: string
): boolean {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const start = byId.get(startNodeId);
  if (!start) return true; // no start node at all is its own (separate) kind of broken, but also can't reach an ending
  const seen = new Set<string>();
  const queue = [startNodeId];
  let foundEnding = false;
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = byId.get(id);
    if (!node) continue;
    if (node.choices.length === 0 && !node.continueTo) {
      foundEnding = true;
      break;
    }
    for (const c of node.choices) if (c.targetNodeId) queue.push(c.targetNodeId);
    if (node.continueTo) queue.push(node.continueTo);
    for (const l of node.lines) if (l.elseNodeId) queue.push(l.elseNodeId);
  }
  return !foundEnding;
}

export function computeProblems(project: Project): Problem[] {
  const problems: Problem[] = [];
  const entryIds = new Set(project.entries.map((e) => e.id));
  const dialogueIds = new Set(project.dialogues.map((d) => d.id));
  const previewSettings = resolvePreviewSettings(project.previewSettings);
  const byId = new Map(project.entries.map((e) => [e.id, e]));

  // 1. Dialogues with no reachable ending (likely stuck in an infinite loop).
  for (const d of project.dialogues) {
    if (d.nodes.length === 0) continue;
    if (dialogueHasNoReachableEnding(d.nodes, d.startNodeId)) {
      problems.push({
        id: `dlg-no-end-${d.id}`,
        message: `Диалог «${d.name}»: не найден путь к завершению — похоже, зацикливается без выхода.`,
        target: { kind: "dialogue", id: d.id },
      });
    }

    // v77-1. Line text that won't fit the configured 320x180 dialogue box (same math as the
    // Test-Play preview's red border — see lib/dialoguePreview.ts; box metrics в Настройках).
    // v77-2. Line emotion the linked character never registered (so no portrait can resolve).
    for (const n of d.nodes) {
      for (const l of n.lines) {
        const overflow = estimateDialogueOverflow(l.text, previewSettings);
        if (!overflow.fits) {
          problems.push({
            id: `dlg-overflow-${d.id}-${l.id}`,
            message: `Диалог «${d.name}»: реплика не помещается в рамку (${overflow.lineCount} строк из ${overflow.maxLines}) — разбейте на две ноды.`,
            target: { kind: "dialogue", id: d.id },
          });
        }
        if (l.emotion && l.speakerEntryId) {
          const speaker = byId.get(l.speakerEntryId);
          const portraits = speaker?.dialogueSpeaker?.portraits ?? [];
          if (portraits.length > 0 && !portraits.some((p) => p.emotion === l.emotion)) {
            problems.push({
              id: `dlg-emotion-${d.id}-${l.id}`,
              message: `Диалог «${d.name}»: эмоция «${l.emotion}» не зарегистрирована у персонажа «${speaker?.name}».`,
              target: { kind: "dialogue", id: d.id },
            });
          }
        }
      }
    }
  }

  for (const e of project.entries) {
    // 2. Equipment with no sprite/icon (the closest existing equivalent of "оружие без
    // мини-игры / брони без спрайта" — a dedicated minigame-assignment check will replace/join
    // this once the Battle/Minigame data model exists).
    if (isEquip(e.category) && !e.image) {
      problems.push({
        id: `equip-no-sprite-${e.id}`,
        message: `«${e.name}»: не назначена иконка/спрайт предмета.`,
        target: { kind: "entry", id: e.id },
      });
    }
    if (isEquip(e.category) && e.slot && e.slot !== "weapon" && !e.overlay) {
      problems.push({
        id: `equip-no-overlay-${e.id}`,
        message: `«${e.name}»: не задан overlay — предмет не будет виден на персонаже при экипировке.`,
        target: { kind: "entry", id: e.id },
      });
    }

    // 3. Quests with no reward AND no dialogue that actually starts them.
    if (isQuest(e.category)) {
      const rewards = e.rewards;
      const hasReward = !!(rewards && (rewards.coins || rewards.xp || rewards.affinity || (rewards.items && rewards.items.length > 0)));
      const hasStartTrigger = project.dialogues.some((d) =>
        d.nodes.some((n) =>
          [...n.lines.flatMap((l) => l.questActions), ...n.choices.flatMap((c) => c.questActions)].some(
            (qa) => qa.kind === "start" && qa.questId === e.id
          )
        )
      );
      if (!hasReward && !hasStartTrigger) {
        problems.push({
          id: `quest-empty-${e.id}`,
          message: `Квест «${e.name}»: нет ни награды, ни диалога, который его запускает.`,
          target: { kind: "entry", id: e.id },
        });
      }
    }

    // 4. Broken references — entry.references / questDependencies pointing at deleted entries.
    for (const refId of e.references) {
      if (!entryIds.has(refId)) {
        problems.push({
          id: `broken-ref-${e.id}-${refId}`,
          message: `«${e.name}»: ссылка на удалённый объект (${refId}).`,
          target: { kind: "entry", id: e.id },
        });
      }
    }
    for (const dep of e.questDependencies ?? []) {
      if (dep.questId && !entryIds.has(dep.questId)) {
        problems.push({
          id: `broken-dep-${e.id}-${dep.questId}`,
          message: `Квест «${e.name}»: зависимость от удалённого квеста (${dep.questId}).`,
          target: { kind: "entry", id: e.id },
        });
      }
    }

    // v77-3. Map transition zones with no destination or a destination that no longer exists —
    // an in-game door to nowhere.
    if (e.category === "location" && e.map) {
      for (const layer of e.map.layers) {
        if (layer.kind !== "zone") continue;
        for (const z of layer.zones) {
          if (z.tag !== "transition") continue;
          if (!z.targetMapId) {
            problems.push({
              id: `transition-no-target-${e.id}-${z.id}`,
              message: `Карта «${e.name}»: переход «${z.label || z.id}» никуда не ведёт — выберите целевую локацию.`,
              target: { kind: "entry", id: e.id },
            });
          } else if (!entryIds.has(z.targetMapId)) {
            problems.push({
              id: `transition-broken-${e.id}-${z.id}`,
              message: `Карта «${e.name}»: переход «${z.label || z.id}» ведёт на удалённую локацию (${z.targetMapId}).`,
              target: { kind: "entry", id: e.id },
            });
          }
        }
      }
    }

    // v77-4. Scene flow steps pointing at deleted dialogues/cutscenes/battles.
    if (e.category === "scene") {
      for (const step of e.sceneFlow ?? []) {
        if (!step.refId) continue;
        const ok = step.kind === "dialogue" ? dialogueIds.has(step.refId) : step.kind === "trigger-zone" ? true : entryIds.has(step.refId);
        if (!ok) {
          problems.push({
            id: `scene-broken-step-${e.id}-${step.id}`,
            message: `Сцена «${e.name}»: шаг «${step.kind}» ссылается на удалённый объект (${step.refId}).`,
            target: { kind: "entry", id: e.id },
          });
        }
      }
    }
  }

  return problems;
}
