import type {
  AudioFxClip,
  CameraClip,
  CharacterAnchor,
  CharacterAnimState,
  CharacterClip,
  CharacterPositionKeyframe,
  ClipEasing,
  CutsceneDialogueClip,
  Entry,
  Keyframe,
} from "../types/database";

// Pure, framework-free math for the Cutscene live preview (Dynarain Phase 2) -- kept separate
// from the React rendering component (CutscenePreview.tsx) so the actual interpolation logic is
// easy to read/verify by inspection without a live browser.

// Standard easing curve set (matches the options a keyframe's "Плавность" dropdown offers in
// the editor) applied to the raw 0..1 progress fraction before handing it to lerp. "bounce" is a
// simple standard out-bounce curve, not a physically simulated spring.
function applyEasing(f: number, easing: ClipEasing | undefined): number {
  const x = Math.max(0, Math.min(1, f));
  switch (easing) {
    case "easeIn":
      return x * x;
    case "easeOut":
      return 1 - (1 - x) * (1 - x);
    case "bounce": {
      const n1 = 7.5625;
      const d1 = 2.75;
      let bt = x;
      if (bt < 1 / d1) return n1 * bt * bt;
      if (bt < 2 / d1) {
        bt -= 1.5 / d1;
        return n1 * bt * bt + 0.75;
      }
      if (bt < 2.5 / d1) {
        bt -= 2.25 / d1;
        return n1 * bt * bt + 0.9375;
      }
      bt -= 2.625 / d1;
      return n1 * bt * bt + 0.984375;
    }
    default:
      return x;
  }
}

export const lerpNum = (a: number, b: number, f: number) => a + (b - a) * f;
export const lerpPoint = (a: { x: number; y: number }, b: { x: number; y: number }, f: number) => ({
  x: lerpNum(a.x, b.x, f),
  y: lerpNum(a.y, b.y, f),
});

// Resolves a scalar property CHANNEL (a flat list of independent point-in-time keyframes) at
// time `t` -- per writer design decision, this is deliberately a "classic" keyframe model, NOT
// the old clip-chain "settle then tween" one: `t` only ever interpolates between the TWO
// keyframes immediately bracketing it, using the arriving key's own easing. Before the first key
// (or with no keys at all) the value holds at the first key's value (or `defaultValue` if there
// are no keys); after the last key it holds at the last key's value. This means inserting,
// moving, or deleting one key ONLY ever affects the (at most) two segments touching it -- never
// ripples through the rest of the sequence the way the old model could.
export function resolveChannel(keys: Keyframe[] | undefined, t: number, defaultValue: number): number {
  const sorted = [...(keys ?? [])].sort((a, b) => a.atMs - b.atMs);
  if (sorted.length === 0) return defaultValue;
  if (t <= sorted[0].atMs) return sorted[0].value;
  const last = sorted[sorted.length - 1];
  if (t >= last.atMs) return last.value;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (t >= a.atMs && t <= b.atMs) {
      const f = b.atMs === a.atMs ? 1 : (t - a.atMs) / (b.atMs - a.atMs);
      return lerpNum(a.value, b.value, applyEasing(f, b.easing));
    }
  }
  return last.value;
}

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

// Camera position/zoom (keyframe channels) + a deterministic (not truly random, so scrubbing the
// timeline back and forth always shows the same wobble) shake jitter layered on top while a
// "shake" clip's window is active (shake stays clip-based -- see CameraClip's doc comment).
//
// `tLive` (defaults to `t` when the caller isn't currently gated on a blocking dialogue) lets
// the whole camera channel set keep resolving on real elapsed time instead of freezing with the
// rest of the scene when `cameraPausesForDialogue` is explicitly false.
export function resolveCamera(
  posX: Keyframe[] | undefined,
  posY: Keyframe[] | undefined,
  zoomKeys: Keyframe[] | undefined,
  shakeClips: CameraClip[],
  t: number,
  defaultCenter: { x: number; y: number },
  cameraPausesForDialogue: boolean | undefined,
  tLive: number = t
): CameraState {
  const effT = cameraPausesForDialogue === false ? tLive : t;

  const x = resolveChannel(posX, effT, defaultCenter.x);
  const y = resolveChannel(posY, effT, defaultCenter.y);
  const zoom = resolveChannel(zoomKeys, effT, 1);

  const shakeClip = shakeClips.find((c) => effT >= c.startMs && effT <= c.startMs + c.durationMs);
  let shakeX = 0;
  let shakeY = 0;
  if (shakeClip) {
    const amp = shakeClip.intensity ?? 0.3;
    shakeX = Math.sin(effT * 0.031) * Math.cos(effT * 0.017) * amp;
    shakeY = Math.cos(effT * 0.027) * Math.sin(effT * 0.041) * amp;
  }

  return { x: x + shakeX, y: y + shakeY, zoom };
}

export interface ResolvedCharacter {
  characterId: string;
  x: number;
  y: number;
  anim: CharacterAnimState;
  speed: number; // percent, default 100
  zIndex: number;
  anchor: CharacterAnchor;
  opacity: number; // 0-100
  flipX: boolean;
}

// Resolves every character's position (from cutsceneCharacterPositionKeys, keyframe channels --
// see resolveChannel) and appearance state (from cutsceneCharacterTrack, still clip-based -- see
// CharacterClip's doc comment for why position/appearance were split this way).
//
// `tLive` is resolved PER CHARACTER -- each character independently checks whichever of their
// own appearance clips is active at the FROZEN `t` and, if that clip's `pausesForDialogue` is
// false, resolves that character's entire position/anim against `tLive` instead, so e.g. one
// ambient character can keep walking during a blocking dialogue while the rest of the cast (and
// the camera) hold still.
export function resolveCharacters(
  positionKeys: CharacterPositionKeyframe[],
  appearanceClips: CharacterClip[],
  characterIds: string[],
  t: number,
  defaultPos: { x: number; y: number },
  tLive: number = t
): ResolvedCharacter[] {
  const result: ResolvedCharacter[] = [];
  for (const characterId of characterIds) {
    const appearance = appearanceClips.filter((c) => c.characterId === characterId).sort((a, b) => a.startMs - b.startMs);
    const activeAtFrozenT = appearance.find((c) => t >= c.startMs && t <= c.startMs + c.durationMs);
    const effT = activeAtFrozenT?.pausesForDialogue === false ? tLive : t;

    const xKeys = positionKeys.filter((k) => k.characterId === characterId && k.axis === "x");
    const yKeys = positionKeys.filter((k) => k.characterId === characterId && k.axis === "y");
    const x = resolveChannel(xKeys, effT, defaultPos.x);
    const y = resolveChannel(yKeys, effT, defaultPos.y);

    const active = appearance.find((c) => effT >= c.startMs && effT <= c.startMs + c.durationMs);
    const anim: CharacterAnimState = active?.anim ?? "idle";

    result.push({
      characterId,
      x,
      y,
      anim,
      speed: active?.speed ?? 100,
      zIndex: active?.zIndex ?? 0,
      anchor: active?.anchor ?? "center",
      opacity: active?.opacity ?? 100,
      flipX: active?.flipX ?? false,
    });
  }
  return result;
}

// Offset fraction (0..1) within the sprite's own box that a given anchor point refers to, e.g.
// "bottom-center" (feet) means the box's horizontal center but its BOTTOM edge sits at the
// clip's x/y, rather than always centering the whole box on x/y ("center", the default -- same
// behavior as before this field existed).
export function anchorOffset(anchor: CharacterAnchor): { ox: number; oy: number } {
  const ox = anchor.includes("left") ? 0 : anchor.includes("right") ? 1 : 0.5;
  const oy = anchor.includes("top") ? 0 : anchor.includes("bottom") ? 1 : 0.5;
  return { ox, oy };
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

// Screen fade/flash overlay state at time `t` (or `tLive` for a clip whose own
// `pausesForDialogue` is false -- decided independently per clip since, unlike camera/character
// position channels, there's no cross-clip carry-over to keep consistent). Fade ramps opacity
// linearly across durationMs ("out" = fading to black, "in" = fading up from black); flash
// spikes 0 -> 1 -> 0 in a triangle wave peaking at the clip's midpoint. If two clips' windows
// overlap (unusual), the last one in the array wins -- simplicity over correctness for this rare
// edge case.
export function resolveOverlay(clips: AudioFxClip[], t: number, tLive: number = t): OverlayState {
  let result: OverlayState = { opacity: 0, color: "#000000" };
  for (const c of clips) {
    if (c.kind !== "fade" && c.kind !== "flash") continue;
    const effT = c.pausesForDialogue === false ? tLive : t;
    const dur = Math.max(1, c.durationMs ?? 500);
    if (effT < c.atMs || effT > c.atMs + dur) continue;
    const f = (effT - c.atMs) / dur;
    if (c.kind === "fade") {
      result = { opacity: c.direction === "in" ? 1 - f : f, color: "#000000" };
    } else {
      result = { opacity: f < 0.5 ? f * 2 : (1 - f) * 2, color: c.color ?? "#ffffff" };
    }
  }
  return result;
}

// Total playable length of the cutscene, for the scrub slider's max value and loop point -- the
// furthest any clip OR keyframe on any channel/track reaches, with a 1s floor so an
// empty/near-empty cutscene still has a usable scrub range instead of a degenerate 0-length
// slider.
export function cutsceneTotalDurationMs(entry: Entry): number {
  const ends: number[] = [1000];
  for (const c of entry.cutsceneCameraTrack ?? []) ends.push(c.startMs + c.durationMs);
  for (const c of entry.cutsceneCharacterTrack ?? []) ends.push(c.startMs + c.durationMs);
  for (const c of entry.cutsceneDialogueTrack ?? []) ends.push(c.atMs + c.durationMs);
  for (const c of entry.cutsceneAudioFxTrack ?? []) ends.push(c.atMs + (c.durationMs ?? 0));
  for (const k of entry.cutsceneCameraPosX ?? []) ends.push(k.atMs);
  for (const k of entry.cutsceneCameraPosY ?? []) ends.push(k.atMs);
  for (const k of entry.cutsceneCameraZoomKeys ?? []) ends.push(k.atMs);
  for (const k of entry.cutsceneCharacterPositionKeys ?? []) ends.push(k.atMs);
  return Math.max(...ends);
}

// Every distinct clip/keyframe boundary across all tracks/channels, sorted ascending with
// duplicates collapsed -- used by the editor's "jump to previous/next clip boundary" transport
// buttons (coarser than the single-frame step buttons) so a director can hop straight between
// edit points the way real NLEs let you jump keyframe-to-keyframe.
export function allClipBoundaries(entry: Entry): number[] {
  const set = new Set<number>();
  for (const c of entry.cutsceneCameraTrack ?? []) {
    set.add(c.startMs);
    set.add(c.startMs + c.durationMs);
  }
  for (const c of entry.cutsceneCharacterTrack ?? []) {
    set.add(c.startMs);
    set.add(c.startMs + c.durationMs);
  }
  for (const c of entry.cutsceneDialogueTrack ?? []) {
    set.add(c.atMs);
    set.add(c.atMs + c.durationMs);
  }
  for (const c of entry.cutsceneAudioFxTrack ?? []) {
    set.add(c.atMs);
    set.add(c.atMs + (c.durationMs ?? 0));
  }
  for (const k of entry.cutsceneCameraPosX ?? []) set.add(k.atMs);
  for (const k of entry.cutsceneCameraPosY ?? []) set.add(k.atMs);
  for (const k of entry.cutsceneCameraZoomKeys ?? []) set.add(k.atMs);
  for (const k of entry.cutsceneCharacterPositionKeys ?? []) set.add(k.atMs);
  return Array.from(set).sort((a, b) => a - b);
}
