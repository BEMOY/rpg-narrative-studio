import type { Dialogue, Entry } from "../../types/database";
import { useProjectStore } from "../../store/useProjectStore";
import { castLabel, trackClips } from "../../lib/cutsceneTracks";
import { EVENT_KIND_LABEL } from "./CutsceneTimeline";

// Read-only "what's actually happening right now" panel (Dynarain Phase 2) -- shown alongside
// the Inspector the whole time a Cutscene editor window is open, not gated behind Play, since
// everything it shows (current clip per track, which flags have been set so far, the most
// recent fired event) is exactly as useful while scrubbing by hand as it is during real
// playback -- a writer verifying "did my script actually reach this flag yet" cares about BOTH.
// Mirrors the reference architecture's own Debug panel (current time/clip/dialogue/flags), with
// "Current Quest"/"Current Variables" swapped out for what this app's actual data model can
// really compute: simulated flag state (from "setFlag" event clips) and the most recently fired
// non-flag event, since a standalone reusable Cutscene entry has no fixed quest of its own.
export function CutsceneDebugPanel({
  entry,
  t,
  totalMs,
  awaitingDialogueEntry,
}: {
  entry: Entry;
  t: number;
  totalMs: number;
  awaitingDialogueEntry?: Dialogue;
}) {
  const allEntries = useProjectStore((s) => s.project.entries);
  const dialogues = useProjectStore((s) => s.project.dialogues);
  const tracks = entry.cutsceneTracks ?? [];
  const cast = entry.cutsceneCast ?? [];

  const activeAt = (startMs: number, durationMs: number) => t >= startMs && t <= startMs + durationMs;

  const shake = trackClips(tracks, "camera").find((c) => activeAt(c.startMs, c.durationMs));

  const activeChars = cast
    .map((member) => {
      const charId = member.instanceId;
      const clip = trackClips(tracks, "character", charId).find((c) => activeAt(c.startMs, c.durationMs));
      const anim = clip?.component.kind === "animation" ? clip.component.anim ?? "idle" : undefined;
      const name = castLabel(cast, allEntries, charId);
      return anim ? `${name}: ${anim}` : null;
    })
    .filter((v): v is string => !!v);

  const dlgClip = trackClips(tracks, "dialogue").find((c) => activeAt(c.startMs, c.durationMs));
  const dlgId = dlgClip?.component.kind === "dialogue" ? dlgClip.component.dialogueId : undefined;
  const currentDialogueName = awaitingDialogueEntry?.name ?? (dlgId ? dialogues.find((d) => d.id === dlgId)?.name : undefined);

  const fx = trackClips(tracks, "audiofx").find((c) => activeAt(c.startMs, c.durationMs));
  const fxLabel =
    fx?.component.kind === "audio"
      ? fx.component.audioKind === "sound"
        ? "Звук"
        : fx.component.audioKind === "music"
          ? "Музыка"
          : fx.component.audioKind === "fade"
            ? "Затемнение"
            : "Вспышка"
      : undefined;

  // Simulated flag state: every "setFlag" event whose time has already passed, applied in order
  // (later overwrites earlier) -- not a real game-variable engine, just enough to let a writer
  // sanity-check "by this point in the cutscene, is this flag actually set yet".
  const eventClips = trackClips(tracks, "event")
    .filter((c) => c.component.kind === "event")
    .sort((a, b) => a.startMs - b.startMs);
  const pastEvents = eventClips.filter((c) => c.startMs <= t);
  const flags = new Map<string, boolean>();
  for (const c of pastEvents) {
    if (c.component.kind === "event" && c.component.eventKind === "setFlag" && c.component.flagName) {
      flags.set(c.component.flagName, c.component.flagValue ?? true);
    }
  }
  const lastNonFlagEvent = [...pastEvents].reverse().find((c) => c.component.kind === "event" && c.component.eventKind !== "setFlag");
  const lastEventLabel =
    lastNonFlagEvent?.component.kind === "event" ? `${EVENT_KIND_LABEL[lastNonFlagEvent.component.eventKind]} (${(lastNonFlagEvent.startMs / 1000).toFixed(1)}s)` : undefined;

  const row = (label: string, value: string | undefined) => (
    <div className="flex items-baseline gap-1.5 text-[11px]">
      <span className="text-[var(--op-40)] shrink-0">{label}:</span>
      <span className="text-[var(--op-70)] truncate">{value ?? "—"}</span>
    </div>
  );

  return (
    <div className="glass rounded-lg p-3 space-y-2">
      <div className="text-xs uppercase tracking-wider text-[var(--op-35)]">Отладка</div>
      {row("Время", `${(t / 1000).toFixed(2)}s / ${(totalMs / 1000).toFixed(2)}s`)}
      {row("Камера", shake ? "Тряска" : undefined)}
      {row("Персонажи", activeChars.length > 0 ? activeChars.join(", ") : undefined)}
      {row("Диалог", currentDialogueName)}
      {row("Аудио/FX", fxLabel)}
      {row("Последнее событие", lastEventLabel)}
      <div className="pt-1 border-t border-[var(--op-10)] mt-1">
        <div className="text-[10px] text-[var(--op-40)] mb-1">Флаги на этот момент</div>
        {flags.size === 0 ? (
          <div className="text-[11px] text-[var(--op-30)]">Ещё не установлены</div>
        ) : (
          <div className="space-y-0.5">
            {Array.from(flags.entries()).map(([name, value]) => (
              <div key={name} className="flex items-center gap-1.5 text-[11px]">
                <span className={value ? "text-emerald-400" : "text-[var(--op-40)]"}>{value ? "✓" : "✗"}</span>
                <span className="text-[var(--op-70)] truncate">{name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
