import type { AudioFxClip, CameraClip, CharacterAnimState, CharacterClip, CutsceneDialogueClip, Entry } from "../types/database";

// Pure, framework-free math for the Cutscene live preview (Dynarain Phase 2) -- kept separate
// from the React rendering component (CutscenePreview.tsx) so the actual interpolation logic is
// easy to read/verify by inspection without a live browser (no way to visually test this session).

// Resolves a value at time `t` across a sequence of "settle-then-tween" clips: before the first
// clip (or with no clips at all) returns `initial`; once a clip's window has fully elapsed its
// value becomes the new resting value for everything after it; while a clip is still playing,
// the value is linearly interpolated from whatever the resting value was going into it, to this
// clip's own target. `clips` MUST already be sorted by startMs ascending.
export function resolveTween<T>(
  clips: { startMs: number; durationMs: number; value: T }[],
  t: number,
  initial: T,
  lerp: (a: T, b: T, f: number) => T
): T {
  let current = initial;
  for (const c of clips) {
    if (t < c.startMs) break;
    const end = c.startMs + c.durationMs;
    if (t >= end) {
      current = c.value;
    } else {
      const f = c.durationMs <= 0 ? 1 : (t - c.startMs) / c.durationMs;
      current = lerp(current, c.value, f);
      break;
    }
  }
  return current;
}

export const lerpNum = (a: number, b: number, f: number) => a + (b - a) * f;
export const lerpPoint = (a: { x: number; y: number }, b: { x: number; y: number }, f: number) => ({
  x: lerpNum(a.x, b.x, f),
  y: lerpNum(a.y, b.y, f),
});

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

// Camera position/zoom in map cell units + a deterministic (not truly random, so scrubbing the
// timeline back and forth always shows the same wobble) shake jitter layered on top while a
// "shake" clip's window is active.
export function resolveCamera(clips: CameraClip[], t: number, defaultCenter: { x: number; y: number }): CameraState {
  const sorted = [...clips].sort((a, b) => a.startMs - b.startMs);
  const moveClips = sorted
    .filter((c): c is CameraClip & { x: number; y: number } => c.kind === "move" && c.x !== undefined && c.y !== undefined)
    .map((c) => ({ startMs: c.startMs, durationMs: c.durationMs, value: { x: c.x, y: c.y } }));
  const zoomClips = sorted
    .filter((c): c is CameraClip & { zoom: number } => c.kind === "zoom" && c.zoom !== undefined)
    .map((c) => ({ startMs: c.startMs, durationMs: c.durationMs, value: c.zoom }));

  const pos = resolveTween(moveClips, t, defaultCenter, lerpPoint);
  const zoom = resolveTween(zoomClips, t, 1, lerpNum);

  const shakeClip = sorted.find((c) => c.kind === "shake" && t >= c.startMs && t <= c.startMs + c.durationMs);
  let shakeX = 0;
  let shakeY = 0;
  if (shakeClip) {
    const amp = shakeClip.intensity ?? 0.3;
    shakeX = Math.sin(t * 0.031) * Math.cos(t * 0.017) * amp;
    shakeY = Math.cos(t * 0.027) * Math.sin(t * 0.041) * amp;
  }

  return { x: pos.x + shakeX, y: pos.y + shakeY, zoom };
}

export interface ResolvedCharacter {
  characterId: string;
  x: number;
  y: number;
  anim: CharacterAnimState;
}

// Groups character clips by characterId, resolves each one's tweened position, and picks
// whichever anim state is active at `t` (the clip covering `t`, if any -- move defaults to
// "walk" and animate defaults to "idle" when the clip itself doesn't specify one; a character
// with no clip covering `t` at all just stands "idle" wherever they currently are).
export function resolveCharacters(clips: CharacterClip[], t: number, defaultPos: { x: number; y: number }): ResolvedCharacter[] {
  const byChar = new Map<string, CharacterClip[]>();
  for (const c of clips) {
    if (!c.characterId) continue;
    if (!byChar.has(c.characterId)) byChar.set(c.characterId, []);
    byChar.get(c.characterId)!.push(c);
  }
  const result: ResolvedCharacter[] = [];
  for (const [characterId, charClips] of byChar) {
    const sorted = [...charClips].sort((a, b) => a.startMs - b.startMs);
    const moveClips = sorted
      .filter((c): c is CharacterClip & { x: number; y: number } => c.kind === "move" && c.x !== undefined && c.y !== undefined)
      .map((c) => ({ startMs: c.startMs, durationMs: c.durationMs, value: { x: c.x, y: c.y } }));
    const pos = resolveTween(moveClips, t, defaultPos, lerpPoint);

    const active = sorted.find((c) => t >= c.startMs && t <= c.startMs + c.durationMs);
    const anim: CharacterAnimState = active ? active.anim ?? (active.kind === "move" ? "walk" : "idle") : "idle";

    result.push({ characterId, x: pos.x, y: pos.y, anim });
  }
  return result;
}

// The dialogue clip (if any) whose display window covers `t` -- used to show a speech-bubble
// overlay in the preview. Assumes clips don't meaningfully overlap; if they do, the first match
// wins.
export function activeDialogueClip(clips: CutsceneDialogueClip[], t: number): CutsceneDialogueClip | undefined {
  return clips.find((c) => t >= c.atMs && t <= c.atMs + c.durationMs);
}

export interface OverlayState {
  opacity: number;
  color: string;
}

// Screen fade/flash overlay state at time `t`. Fade ramps opacity linearly across durationMs
// ("out" = fading to black, "in" = fading up from black); flash spikes 0 -> 1 -> 0 in a
// triangle wave peaking at the clip's midpoint. If two clips' windows overlap (unusual), the
// last one in the array wins -- simplicity over correctness for this rare edge case.
export function resolveOverlay(clips: AudioFxClip[], t: number): OverlayState {
  let result: OverlayState = { opacity: 0, color: "#000000" };
  for (const c of clips) {
    if (c.kind !== "fade" && c.kind !== "flash") continue;
    const dur = Math.max(1, c.durationMs ?? 500);
    if (t < c.atMs || t > c.atMs + dur) continue;
    const f = (t - c.atMs) / dur;
    if (c.kind === "fade") {
      result = { opacity: c.direction === "in" ? 1 - f : f, color: "#000000" };
    } else {
      result = { opacity: f < 0.5 ? f * 2 : (1 - f) * 2, color: c.color ?? "#ffffff" };
    }
  }
  return result;
}

// Total playable length of the cutscene, for the scrub slider's max value and loop point --
// the furthest any clip on any track reaches, with a 1s floor so an empty/near-empty cutscene
// still has a usable scrub range instead of a degenerate 0-length slider.
export function cutsceneTotalDurationMs(entry: Entry): number {
  const ends: number[] = [1000];
  for (const c of entry.cutsceneCameraTrack ?? []) ends.push(c.startMs + c.durationMs);
  for (const c of entry.cutsceneCharacterTrack ?? []) ends.push(c.startMs + c.durationMs);
  for (const c of entry.cutsceneDialogueTrack ?? []) ends.push(c.atMs + c.durationMs);
  for (const c of entry.cutsceneAudioFxTrack ?? []) ends.push(c.atMs + (c.durationMs ?? 0));
  return Math.max(...ends);
}
