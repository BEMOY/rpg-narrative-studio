import type { DialogueCondition, Entry } from "../types/database";

export interface DialogueTestState {
  flags: Record<string, string>;
  entryFlags: Record<string, boolean>; // manual "has/not_has" toggles for entry-kind conditions during testing
}

function questStatus(entry: Entry): "not_started" | "active" | "done" {
  const objs = entry.objectives ?? [];
  if (objs.length === 0) return "not_started";
  if (objs.every((o) => o.done)) return "done";
  if (objs.some((o) => o.done)) return "active";
  return "not_started";
}

export function evalCondition(cond: DialogueCondition | undefined, state: DialogueTestState, entries: Entry[]): boolean {
  if (!cond || !cond.key) return true;
  if (cond.kind === "flag") {
    const v = state.flags[cond.key] ?? "";
    return cond.op === "neq" ? v !== (cond.value ?? "") : v === (cond.value ?? "");
  }
  if (cond.kind === "quest") {
    const entry = entries.find((e) => e.id === cond.key);
    const status = entry ? questStatus(entry) : "not_started";
    return status === (cond.value ?? "active");
  }
  // "entry" — no real player-inventory system exists, so the tester toggles these by hand
  const has = state.entryFlags[cond.key] ?? false;
  return cond.op === "has" ? has : !has;
}
