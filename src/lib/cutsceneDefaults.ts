import type { CharacterPositionKeyframe, Entry, Keyframe } from "../types/database";
import { nextId } from "./mapDefaults";

// Backfills an Entry's Cutscene fields from the OLD clip-based camera "move"/"zoom" and
// character "move" shapes (pre keyframe-channel rework) into the new Keyframe[] channels, the
// same "evolve, never rewrite, backfill once at load time" approach already used for
// Scene/Character data elsewhere in this codebase (see normalizeSceneEntry). Idempotent: once
// the new channel fields exist, this is a no-op, so it's safe to run on every project load.
//
// The conversion is a best-effort, not a byte-for-byte behavioral clone: each old "move"/"zoom"
// clip becomes ONE arrival keyframe at `startMs + durationMs` carrying the clip's own target
// value and easing (the clip's departure value came from whatever the PREVIOUS clip's resting
// value was, which the new model reproduces anyway by simply holding constant before the next
// key) -- the exact shape of the transition window can differ slightly from the old
// "settle-then-tween" math if there were gaps between clips, but the actually-authored arrival
// points and their easing are preserved faithfully, which is what matters for not losing work.
export function normalizeCutsceneEntry(entry: Entry): Entry {
  if (entry.category !== "cutscene") return entry;

  const needsCameraMigration =
    !entry.cutsceneCameraPosX && !entry.cutsceneCameraPosY && !entry.cutsceneCameraZoomKeys && (entry.cutsceneCameraTrack?.length ?? 0) > 0;
  const needsCharMigration = !entry.cutsceneCharacterPositionKeys && (entry.cutsceneCharacterTrack?.length ?? 0) > 0;

  if (!needsCameraMigration && !needsCharMigration) return entry;

  let cameraPosX: Keyframe[] = entry.cutsceneCameraPosX ?? [];
  let cameraPosY: Keyframe[] = entry.cutsceneCameraPosY ?? [];
  let cameraZoomKeys: Keyframe[] = entry.cutsceneCameraZoomKeys ?? [];
  let cameraShakeClips = entry.cutsceneCameraTrack ?? [];

  if (needsCameraMigration) {
    const oldCamClips = (entry.cutsceneCameraTrack ?? []) as unknown as Array<{
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
    }>;
    for (const c of oldCamClips) {
      const atMs = c.startMs + c.durationMs;
      if (c.kind === "move" && c.x !== undefined && c.y !== undefined) {
        cameraPosX = [...cameraPosX, { id: nextId("key"), atMs, value: c.x, easing: c.easing }];
        cameraPosY = [...cameraPosY, { id: nextId("key"), atMs, value: c.y, easing: c.easing }];
      } else if (c.kind === "zoom" && c.zoom !== undefined) {
        cameraZoomKeys = [...cameraZoomKeys, { id: nextId("key"), atMs, value: c.zoom, easing: c.easing }];
      }
    }
    // Only "shake" clips remain in the clip track going forward.
    cameraShakeClips = oldCamClips.filter((c) => c.kind === "shake") as typeof cameraShakeClips;
  }

  let characterPositionKeys: CharacterPositionKeyframe[] = entry.cutsceneCharacterPositionKeys ?? [];
  let characterAppearanceClips = entry.cutsceneCharacterTrack ?? [];

  if (needsCharMigration) {
    const oldCharClips = (entry.cutsceneCharacterTrack ?? []) as unknown as Array<{
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
    }>;
    const newKeys: CharacterPositionKeyframe[] = [];
    const newAppearance: typeof characterAppearanceClips = [];
    for (const c of oldCharClips) {
      if (!c.characterId) continue;
      if (c.kind === "move" && c.x !== undefined && c.y !== undefined) {
        const atMs = c.startMs + c.durationMs;
        newKeys.push({ id: nextId("ckey"), characterId: c.characterId, axis: "x", atMs, value: c.x, easing: c.easing });
        newKeys.push({ id: nextId("ckey"), characterId: c.characterId, axis: "y", atMs, value: c.y, easing: c.easing });
        // A "move" clip could also carry an anim override -- preserve it as its own appearance
        // clip so that override isn't silently dropped by the migration.
        if (c.anim) {
          newAppearance.push({
            id: c.id,
            startMs: c.startMs,
            durationMs: c.durationMs,
            characterId: c.characterId,
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
          });
        }
      } else {
        newAppearance.push({
          id: c.id,
          startMs: c.startMs,
          durationMs: c.durationMs,
          characterId: c.characterId,
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
        });
      }
    }
    characterPositionKeys = [...characterPositionKeys, ...newKeys];
    characterAppearanceClips = newAppearance;
  }

  return {
    ...entry,
    cutsceneCameraPosX: cameraPosX,
    cutsceneCameraPosY: cameraPosY,
    cutsceneCameraZoomKeys: cameraZoomKeys,
    cutsceneCameraTrack: cameraShakeClips,
    cutsceneCharacterPositionKeys: characterPositionKeys,
    cutsceneCharacterTrack: characterAppearanceClips,
  };
}
