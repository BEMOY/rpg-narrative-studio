import type { CharacterPositionKeyframe, CutsceneCastMember, CutsceneClip, CutsceneTrack, Entry, Keyframe } from "../types/database";
import { nextId } from "./mapDefaults";

// Backfills an Entry's Cutscene fields from OLDER shapes into the CURRENT one, the same "evolve,
// never rewrite, backfill once at load time" approach already used for Scene/Character data
// elsewhere in this codebase (see normalizeSceneEntry). Idempotent, and safe to run on every
// project load. Two independent migrations live here, run in order:
//
//  1. clip-chain camera/character "move"/"zoom" clips -> keyframe channels (cutsceneCameraPosX/
//     PosY/ZoomKeys, cutsceneCharacterPositionKeys) -- from the earlier keyframe-channel rework.
//  2. the four separately-typed clip tracks (cutsceneCameraTrack/cutsceneCharacterTrack/
//     cutsceneDialogueTrack/cutsceneAudioFxTrack) -> one generic cutsceneTracks: CutsceneTrack[]
//     list, each clip tagged with a typed `component` -- from the Track+Clip+Component
//     architecture rework. See the doc comment above CutsceneTrackKind in types/database.ts for
//     the full rationale.
//  3. cutsceneCastCharacterIds: string[] -> cutsceneCast: CutsceneCastMember[] -- from the v75
//     "Персонажи + Объекты/Предметы" + duplicate-instance rework. Identity migration: each old
//     raw id becomes { instanceId: id, entryId: id }, since every character-track/position-key/
//     color record was already keyed by that same raw id string -- no other data needs to change.
//
// Both migrations read the OLDER shapes via `as unknown as` casts against inline anonymous types
// (rather than importing long-gone named interfaces) since the whole point is that those shapes
// no longer exist in the current type system -- this is the one place still allowed to know what
// they used to look like.
export function normalizeCutsceneEntry(entry: Entry): Entry {
  if (entry.category !== "cutscene") return entry;

  const needsCameraKeyMigration =
    !entry.cutsceneCameraPosX && !entry.cutsceneCameraPosY && !entry.cutsceneCameraZoomKeys && legacyLen(entry, "cutsceneCameraTrack") > 0;
  const needsCharKeyMigration = !entry.cutsceneCharacterPositionKeys && legacyLen(entry, "cutsceneCharacterTrack") > 0;
  const needsTracksMigration = !entry.cutsceneTracks;
  const needsCastMigration = !entry.cutsceneCast;

  if (!needsCameraKeyMigration && !needsCharKeyMigration && !needsTracksMigration && !needsCastMigration) return entry;

  let cameraPosX: Keyframe[] = entry.cutsceneCameraPosX ?? [];
  let cameraPosY: Keyframe[] = entry.cutsceneCameraPosY ?? [];
  let cameraZoomKeys: Keyframe[] = entry.cutsceneCameraZoomKeys ?? [];
  // Shake-only camera clips, in the OLD per-kind shape -- becomes input to the tracks migration
  // below regardless of which migration(s) actually run this pass.
  let legacyCameraClips = (entry as unknown as { cutsceneCameraTrack?: LegacyCameraClip[] }).cutsceneCameraTrack ?? [];

  if (needsCameraKeyMigration) {
    for (const c of legacyCameraClips) {
      const atMs = c.startMs + c.durationMs;
      if (c.kind === "move" && c.x !== undefined && c.y !== undefined) {
        cameraPosX = [...cameraPosX, { id: nextId("key"), atMs, value: c.x, easing: c.easing }];
        cameraPosY = [...cameraPosY, { id: nextId("key"), atMs, value: c.y, easing: c.easing }];
      } else if (c.kind === "zoom" && c.zoom !== undefined) {
        cameraZoomKeys = [...cameraZoomKeys, { id: nextId("key"), atMs, value: c.zoom, easing: c.easing }];
      }
    }
    // Only "shake" clips carry forward into the clip track going forward.
    legacyCameraClips = legacyCameraClips.filter((c) => c.kind === "shake");
  }

  let characterPositionKeys: CharacterPositionKeyframe[] = entry.cutsceneCharacterPositionKeys ?? [];
  let legacyCharClips = (entry as unknown as { cutsceneCharacterTrack?: LegacyCharacterClip[] }).cutsceneCharacterTrack ?? [];

  if (needsCharKeyMigration) {
    const newKeys: CharacterPositionKeyframe[] = [];
    const newAppearance: LegacyCharacterClip[] = [];
    for (const c of legacyCharClips) {
      if (!c.characterId) continue;
      if (c.kind === "move" && c.x !== undefined && c.y !== undefined) {
        const atMs = c.startMs + c.durationMs;
        newKeys.push({ id: nextId("ckey"), characterId: c.characterId, axis: "x", atMs, value: c.x, easing: c.easing });
        newKeys.push({ id: nextId("ckey"), characterId: c.characterId, axis: "y", atMs, value: c.y, easing: c.easing });
        // A "move" clip could also carry an anim override -- preserve it as its own appearance
        // clip so that override isn't silently dropped by the migration.
        if (c.anim) newAppearance.push({ ...c, kind: "animate" });
      } else {
        newAppearance.push(c);
      }
    }
    characterPositionKeys = [...characterPositionKeys, ...newKeys];
    legacyCharClips = newAppearance;
  }

  let cast: CutsceneCastMember[] = entry.cutsceneCast ?? [];
  if (needsCastMigration) {
    cast = (entry.cutsceneCastCharacterIds ?? []).map((id) => ({ instanceId: id, entryId: id }));
  }

  let tracks: CutsceneTrack[] = entry.cutsceneTracks ?? [];
  if (needsTracksMigration) {
    const cameraClips: CutsceneClip[] = legacyCameraClips.map((c) => ({
      id: c.id,
      startMs: c.startMs,
      durationMs: c.durationMs,
      component: { kind: "shake", intensity: c.intensity, pausesForDialogue: c.pausesForDialogue },
    }));

    const characterTracks: CutsceneTrack[] = [];
    const castIds = new Set<string>(cast.map((m) => m.instanceId));
    for (const c of legacyCharClips) if (c.characterId) castIds.add(c.characterId);
    for (const characterId of castIds) {
      const clips: CutsceneClip[] = legacyCharClips
        .filter((c) => c.characterId === characterId)
        .map((c) => ({
          id: c.id,
          startMs: c.startMs,
          durationMs: c.durationMs,
          component: {
            kind: "animation",
            anim: c.anim,
            pausesForDialogue: c.pausesForDialogue,
            speed: c.speed,
            zIndex: c.zIndex,
            anchor: c.anchor,
            opacity: c.opacity,
            flipX: c.flipX,
            conditionExpr: c.conditionExpr,
            tags: c.tags,
            notes: c.notes,
          },
        }));
      characterTracks.push({ id: nextId("track"), kind: "character", characterId, clips });
    }

    const legacyDialogueClips =
      (entry as unknown as { cutsceneDialogueTrack?: LegacyDialogueClip[] }).cutsceneDialogueTrack ?? [];
    const dialogueClips: CutsceneClip[] = legacyDialogueClips.map((c) => ({
      id: c.id,
      startMs: c.atMs,
      durationMs: c.durationMs,
      component: { kind: "dialogue", dialogueId: c.dialogueId },
    }));

    const legacyAudioClips = (entry as unknown as { cutsceneAudioFxTrack?: LegacyAudioFxClip[] }).cutsceneAudioFxTrack ?? [];
    const audioClips: CutsceneClip[] = legacyAudioClips.map((c) => ({
      id: c.id,
      startMs: c.atMs,
      durationMs: c.durationMs ?? 0,
      component: {
        kind: "audio",
        audioKind: c.kind,
        assetName: c.assetName,
        color: c.color,
        direction: c.direction,
        pausesForDialogue: c.pausesForDialogue,
      },
    }));

    tracks = [
      { id: nextId("track"), kind: "camera", clips: cameraClips },
      ...characterTracks,
      { id: nextId("track"), kind: "dialogue", clips: dialogueClips },
      { id: nextId("track"), kind: "audiofx", clips: audioClips },
    ];
  }

  return {
    ...entry,
    cutsceneCameraPosX: cameraPosX,
    cutsceneCameraPosY: cameraPosY,
    cutsceneCameraZoomKeys: cameraZoomKeys,
    cutsceneCharacterPositionKeys: characterPositionKeys,
    cutsceneTracks: tracks,
    cutsceneCast: cast,
  };
}

function legacyLen(entry: Entry, field: "cutsceneCameraTrack" | "cutsceneCharacterTrack"): number {
  return ((entry as unknown as Record<string, unknown[] | undefined>)[field] ?? []).length;
}

interface LegacyCameraClip {
  id: string;
  startMs: number;
  durationMs: number;
  kind: string;
  x?: number;
  y?: number;
  zoom?: number;
  intensity?: number;
  easing?: Keyframe["easing"];
  pausesForDialogue?: boolean;
}

interface LegacyCharacterClip {
  id: string;
  startMs: number;
  durationMs: number;
  characterId?: string;
  kind?: string;
  x?: number;
  y?: number;
  anim?: any;
  easing?: Keyframe["easing"];
  pausesForDialogue?: boolean;
  speed?: number;
  zIndex?: number;
  anchor?: any;
  opacity?: number;
  flipX?: boolean;
  conditionExpr?: string;
  tags?: string[];
  notes?: string;
}

interface LegacyDialogueClip {
  id: string;
  atMs: number;
  durationMs: number;
  dialogueId?: string;
}

interface LegacyAudioFxClip {
  id: string;
  atMs: number;
  kind: "sound" | "music" | "fade" | "flash";
  assetName?: string;
  durationMs?: number;
  color?: string;
  direction?: "in" | "out";
  pausesForDialogue?: boolean;
}
