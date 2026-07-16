import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useProjectStore } from "../store/useProjectStore";
import type { Dialogue, DialogueCondition, Entry } from "../types/database";
import { evalCondition, type DialogueTestState } from "./dialogueEval";
import { parseDialogueMarkup, resolveGmlColor } from "./dialogueMarkup";

const QUEST_STATUS_LABEL: Record<string, string> = { not_started: "не начат", active: "активен", done: "выполнен" };

// Player-facing (short) description of why a locked choice is locked — shown next to the lock
// icon instead of just hiding the choice outright. Shared by both the standalone Test-Play
// modal and the embedded in-cutscene dialogue box (see DialoguePlayArea.tsx) since both render
// the exact same choice-lock UI.
export function describeCondition(cond: DialogueCondition | undefined, entries: Entry[]): string {
  if (!cond || !cond.key) return "";
  if (cond.kind === "flag") return `${cond.key} ${cond.op === "neq" ? "≠" : "="} ${cond.value ?? ""}`;
  if (cond.kind === "quest") {
    const e = entries.find((x) => x.id === cond.key);
    const label = QUEST_STATUS_LABEL[cond.value ?? "active"] ?? cond.value ?? "";
    return `${e?.name ?? cond.key}: ${label}`;
  }
  const e = entries.find((x) => x.id === cond.key);
  return `${cond.op === "has" ? "нужен: " : "не должно быть: "}${e?.name ?? cond.key}`;
}

// Collects every distinct entry-kind condition used anywhere in the dialogue so the tester
// can manually flip "has / not_has" toggles for them — there's no real per-playthrough
// inventory system in the Studio, so this stands in for it during testing.
function collectEntryConditions(dialogue: Dialogue): DialogueCondition[] {
  const seen = new Map<string, DialogueCondition>();
  for (const n of dialogue.nodes) {
    for (const l of n.lines) if (l.condition?.kind === "entry" && l.condition.key) seen.set(l.condition.key, l.condition);
    for (const c of n.choices) if (c.condition?.kind === "entry" && c.condition.key) seen.set(c.condition.key, c.condition);
  }
  return Array.from(seen.values());
}

const BASE_MS_PER_CHAR = 26;

// The full interactive dialogue-playback state machine (typewriter reveal, node navigation,
// choices, flags, conditions, keyboard nav) — extracted out of what used to be the standalone
// TestPlayModal component so it can drive TWO different presentations of the exact same live
// conversation: the full-screen Test-Play modal (Dialogue editor) AND the embedded, no-backdrop
// dialogue box shown directly on the Cutscene preview stage while a cutscene is paused waiting
// on a blocking dialogue clip. Both call this hook and hand its return value to
// <DialoguePlayArea>, so the actual conversation logic can never drift between the two.
export function useDialoguePlayer(dialogue: Dialogue) {
  const entries = useProjectStore((s) => s.project.entries);
  const [nodeId, setNodeId] = useState(dialogue.startNodeId);
  const [lineIdx, setLineIdx] = useState(0);
  const [state, setState] = useState<DialogueTestState>({ flags: {}, entryFlags: {} });
  const [ended, setEnded] = useState(false);
  const [revealCount, setRevealCount] = useState(0);
  const [phase, setPhase] = useState<"typing" | "done">("done");
  const [focusedChoice, setFocusedChoice] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const entryConds = useMemo(() => collectEntryConditions(dialogue), [dialogue]);
  const node = dialogue.nodes.find((n) => n.id === nodeId);
  const visibleLines = (node?.lines ?? []).filter((l) => evalCondition(l.condition, state, entries));
  const currentLine = visibleLines[lineIdx];
  // Choices are never hidden by their condition anymore — they render disabled/locked instead
  // (see the render block below), so the player can see what's gating them.
  const allChoices = node?.choices ?? [];
  const choiceMet = useMemo(
    () => new Map(allChoices.map((c) => [c.id, evalCondition(c.condition, state, entries)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allChoices, state, entries]
  );
  const atLastLine = lineIdx >= visibleLines.length - 1;

  // A line whose own condition fails but which has an explicit fallback node set redirects the
  // whole conversation there instead of being silently skipped — first match wins, in the
  // node's own line order.
  const redirectLine = (node?.lines ?? []).find((l) => l.condition && l.elseNodeId && !evalCondition(l.condition, state, entries));
  const redirectTarget = redirectLine?.elseNodeId;

  const speakerEntry = currentLine?.speakerEntryId ? entries.find((e) => e.id === currentLine.speakerEntryId) : undefined;
  const speakerData = speakerEntry?.dialogueSpeaker;
  const displayName = speakerData?.displayName || speakerEntry?.name || currentLine?.speaker || "";
  const nameColor = resolveGmlColor(speakerData?.color);
  const showPortrait = !!currentLine && currentLine.side !== "none" && (!!displayName || !!currentLine.speaker);

  const restart = () => {
    setNodeId(dialogue.startNodeId);
    setLineIdx(0);
    setState({ flags: {}, entryFlags: {} });
    setEnded(false);
  };

  const goToNode = (id: string | undefined) => {
    if (!id) {
      setEnded(true);
      return;
    }
    setNodeId(id);
    setLineIdx(0);
  };

  const advanceLine = () => {
    if (lineIdx + 1 < visibleLines.length) setLineIdx(lineIdx + 1);
  };

  // Line-level flag_set (see LineBlock's "+ flag_set" button in DialogueNodeCard.tsx) applies
  // the moment its line is actually SHOWN — mirrors pickChoice's flag application below, just
  // triggered by navigation instead of a click. Quest actions on lines are intentionally NOT
  // simulated here, matching this same gap for CHOICE quest actions just below (this tester
  // only ever tracked flags/dialogue flow, never quest state — see QuestsView's own separate
  // "what if" simulation for that).
  useEffect(() => {
    if (!currentLine || currentLine.flagSets.length === 0) return;
    setState((s) => {
      const flags = { ...s.flags };
      let changed = false;
      for (const fs of currentLine.flagSets) {
        if (flags[fs.key] !== fs.value) {
          flags[fs.key] = fs.value;
          changed = true;
        }
      }
      return changed ? { ...s, flags } : s;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLine?.id]);

  const pickChoice = (choiceId: string) => {
    const choice = node?.choices.find((c) => c.id === choiceId);
    if (!choice) return;
    if (!(choiceMet.get(choiceId) ?? true)) return; // locked — ignore
    if (choice.flagSets.length) {
      setState((s) => {
        const flags = { ...s.flags };
        for (const fs of choice.flagSets) flags[fs.key] = fs.value;
        return { ...s, flags };
      });
    }
    goToNode(choice.targetNodeId);
  };

  // Typewriter reveal, mirroring obj_dialogue's "typing" state: per-glyph speed multipliers
  // from [speed=N] and extra pauses from [pause=N] both apply; a speaker's own text_speed
  // (from the "Диалог" tab on their Character entry, if linked) scales the overall pace.
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!currentLine) {
      setRevealCount(0);
      setPhase("done");
      return;
    }
    const glyphs = parseDialogueMarkup(currentLine.text);
    setRevealCount(0);
    setPhase(glyphs.length > 0 ? "typing" : "done");
    const speedFactor = speakerData?.textSpeed ? speakerData.textSpeed / 0.3 : 1;
    let i = 0;
    const step = () => {
      i++;
      setRevealCount(i);
      if (i >= glyphs.length) {
        setPhase("done");
        return;
      }
      const g = glyphs[i - 1];
      const delay = Math.max(4, (BASE_MS_PER_CHAR * speedFactor) / (g.speed || 1)) + g.pauseAfter * 16;
      timerRef.current = setTimeout(step, delay);
    };
    if (glyphs.length > 0) timerRef.current = setTimeout(step, Math.max(4, BASE_MS_PER_CHAR * speedFactor));
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId, lineIdx, currentLine?.text]);

  useEffect(() => setFocusedChoice(0), [nodeId, lineIdx]);

  // Choices only ever show once at least one line actually displayed (an all-conditions-failed
  // node just falls through to continueTo/redirect silently, per the "don't show choices for
  // content that never appeared" rule), and never alongside an active line-level redirect.
  const choosing = !ended && !!node && atLastLine && phase === "done" && !redirectTarget && visibleLines.length > 0 && allChoices.length > 0;

  // Auto-advance the instant a node with nothing to show is entered — a line-level redirect
  // (elseNodeId) or a node with zero visible lines and zero choices used to just sit there
  // showing "нет видимых реплик" until the player clicked through it, which reads as a broken
  // beat rather than an invisible/instant branch. Keyed on nodeId alone so this fires exactly
  // once per node-entry (not on every flag change while already sitting on the node), and only
  // after node/redirectTarget/visibleLines have been freshly recomputed for that new node.
  // useLayoutEffect (not useEffect) so this resolves before the browser paints — otherwise a
  // node with nothing to show would flash "нет видимых реплик" for one frame before jumping
  // away, instead of the redirect/skip reading as instant.
  useLayoutEffect(() => {
    if (ended || !node) return;
    if (redirectTarget) {
      goToNode(redirectTarget);
      return;
    }
    if (visibleLines.length === 0 && allChoices.length === 0) {
      goToNode(node.continueTo);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId]);

  const choosingRef = useRef(choosing);
  choosingRef.current = choosing;
  const allChoicesRef = useRef(allChoices);
  allChoicesRef.current = allChoices;
  const choiceMetRef = useRef(choiceMet);
  choiceMetRef.current = choiceMet;
  const focusedChoiceRef = useRef(focusedChoice);
  focusedChoiceRef.current = focusedChoice;

  const handleBoxClick = () => {
    if (ended || !node) return;
    if (currentLine && phase === "typing") {
      if (currentLine.noSkip) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      setRevealCount(parseDialogueMarkup(currentLine.text).length);
      setPhase("done");
      return;
    }
    if (!atLastLine) {
      advanceLine();
      return;
    }
    if (redirectTarget) {
      goToNode(redirectTarget);
      return;
    }
    if (allChoices.length === 0 || visibleLines.length === 0) {
      goToNode(node.continueTo);
    }
  };
  const handleBoxClickRef = useRef(handleBoxClick);
  handleBoxClickRef.current = handleBoxClick;
  const pickChoiceRef = useRef(pickChoice);
  pickChoiceRef.current = pickChoice;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (choosingRef.current) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setFocusedChoice((f) => (f + 1) % allChoicesRef.current.length);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setFocusedChoice((f) => (f - 1 + allChoicesRef.current.length) % allChoicesRef.current.length);
        } else if (e.key === "Enter") {
          e.preventDefault();
          const c = allChoicesRef.current[focusedChoiceRef.current];
          if (c && (choiceMetRef.current.get(c.id) ?? true)) pickChoiceRef.current(c.id);
        }
        return;
      }
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleBoxClickRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return {
    entries,
    entryConds,
    state,
    setState,
    node,
    ended,
    currentLine,
    phase,
    revealCount,
    showPortrait,
    speakerEntry,
    displayName,
    nameColor,
    atLastLine,
    redirectTarget,
    choosing,
    allChoices,
    choiceMet,
    focusedChoice,
    setFocusedChoice,
    restart,
    goToNode,
    advanceLine,
    pickChoice,
    handleBoxClick,
  };
}

export type DialoguePlayer = ReturnType<typeof useDialoguePlayer>;
