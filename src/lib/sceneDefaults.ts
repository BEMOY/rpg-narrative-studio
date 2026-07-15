import type { Entry, SceneOutcome, SceneStep, SceneStepKind } from "../types/database";
import { nextId } from "./mapDefaults";

// Per-kind rules for a step's outcomes, shared by the editor (ScenePanel, EntryEditor.tsx, when
// the writer switches a step's kind) and by hydration below (for scenes saved before outcomes
// existed at all): cutscene/trigger-zone always collapse to exactly one auto-labelled "Далее"
// outcome; battle always collapses to the two fixed "Победа"/"Поражение" outcomes; dialogue is
// left untouched since its outcome list is entirely free-form and writer-managed.
export function normalizeOutcomesForKind(kind: SceneStepKind, existing: SceneOutcome[]): SceneOutcome[] {
  if (kind === "battle") {
    const win = existing.find((o) => o.label === "Победа") ?? { id: nextId("out"), label: "Победа" };
    const lose = existing.find((o) => o.label === "Поражение") ?? { id: nextId("out"), label: "Поражение" };
    return [win, lose];
  }
  if (kind === "cutscene" || kind === "trigger-zone") {
    const first = existing[0] ?? { id: nextId("out"), label: "Далее" };
    return [{ ...first, label: "Далее" }];
  }
  return existing;
}

// Backward compatibility: scenes saved before SceneStep.outcomes existed (the pre-branching
// linear flow model) come back from Supabase/localStorage without it at all -- never let that
// older data crash the newer branching UI (same discipline as normalizeDialogue/normalizeMap).
// Backfills each step's outcomes using the same per-kind rules the editor itself enforces, so a
// battle/cutscene/trigger-zone step isn't stuck permanently outcome-less (those kinds don't get
// an "add outcome" button in the editor since their outcome count is auto-managed).
export function normalizeSceneEntry(e: Entry): Entry {
  if (!e.sceneFlow) return e;
  return {
    ...e,
    sceneFlow: e.sceneFlow.map((step: SceneStep) => ({
      ...step,
      outcomes: normalizeOutcomesForKind(step.kind, step.outcomes ?? []),
    })),
  };
}
