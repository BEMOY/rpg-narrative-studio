import type {
  CharacterAnchor,
  CharacterAnimState,
  CharacterPositionKeyframe,
  ClipEasing,
  CutsceneTrack,
  Entry,
  Keyframe,
} from "../types/database";
import { trackClips } from "./cutsceneTracks";

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
// a clip-chain "settle then tween" one: `t` only ever interpolates between the TWO keyframes
// immediately bracketing it, using the arriving key's own easing. Before the first key (or with
// no keys at all) the value holds at the first key's value (or `defaultValue` if there are no
// keys); after the last key it holds at the last key's value. This means inserting, moving, or
// deleting one key ONLY ever affects the (at most) two segments touching it -- never ripples
// through the rest of the sequence.
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
// "shake" clip's window is active. Shake clips live on the generic "camera" track (see
// CutsceneTrackKind in types/database.ts) -- `tracks` is passed through (rather than a
// pre-filtered shake-clip list) so this stays a thin, obvious call site wherever it's used.
//
// `tLive` (defaults to `t` when the caller isn't currently gated on a blocking dialogue) lets
// the whole camera channel set keep resolving on real elapsed time instead of freezing with the
// rest of the scene when `cameraPausesForDialogue` is explicitly false.
export function resolveCamera(
  posX: Keyframe[] | undefined,
  posY: Keyframe[] | undefined,
  zoomKeys: Keyframe[] | undefined,
  tracks: CutsceneTrack[],
  t: number,
  defaultCenter: { x: number; y: number },
  cameraPausesForDialogue: boolean | undefined,
  tLive: number = t
): CameraState {
  const effT = cameraPausesForDialogue === false ? tLive : t;

  const x = resolveChannel(posX, effT, defaultCenter.x);
  const y = resolveChannel(posY, effT, defaultCenter.y);
  const zoom = resolveChannel(zoomKeys, effT, 1);

  const shakeClips = trackClips(tracks, "camera");
  const shakeClip = shakeClips.find(
    (c) => c.component.kind === "shake" && effT >= c.startMs && effT <= c.startMs + c.durationMs
  );
  let shakeX = 0;
  let shakeY = 0;
  if (shakeClip && shakeClip.component.kind === "shake") {
    const amp = shakeClip.component.intensity ?? 0.3;
    shakeX = Math.sin(effT * 0.031) * Math.cos(effT * 0.017) * amp;
    shakeY = Math.cos(effT * 0.027) * Math.sin(effT * 0.041) * amp;
  }

  return { x: x + shakeX, y: y + shakeY, zoom };
}

// Resolves the "active" (appear/disappear) STEP channel at time `t` -- unlike resolveChannel
// above, this deliberately does NOT interpolate: the value HOLDS at whichever key was most
// recently crossed (a presence toggle has no meaningful in-between state). With no keys at all,
// the actor is always active -- this is what keeps every pre-existing cutscene's cast rendering
// exactly as it did before this "Активен" track existed. Once at least one key exists, the actor
// is INACTIVE before the first key (it hasn't appeared yet) -- this is what actually lets a
// writer drag a key onto the timeline to make an object/character appear at a specific moment.
export function resolveActiveChannel(keys: Keyframe[] | undefined, t: number): boolean {
  const sorted = [...(keys ?? [])].sort((a, b) => a.atMs - b.atMs);
  if (sorted.length === 0) return true;
  if (t < sorted[0].atMs) return false;
  let value = sorted[0].value;
  for (const k of sorted) {
    if (k.atMs > t) break;
    value = k.value;
  }
  return value >= 0.5;
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
// see resolveChannel) and appearance state (from that character's own "character" track, still
// clip-based -- see the "animation" CutsceneComponent's doc comment for why position/appearance
// were split this way).
//
// `tLive` is resolved PER CHARACTER -- each character independently checks whichever of their
// own appearance clips is active at the FROZEN `t` and, if that clip's `pausesForDialogue` is
// false, resolves that character's entire position/anim against `tLive` instead, so e.g. one
// ambient character can keep walking during a blocking dialogue while the rest of the cast (and
// the camera) hold still.
export function resolveCharacters(
  positionKeys: CharacterPositionKeyframe[],
  tracks: CutsceneTrack[],
  characterIds: string[],
  t: number,
  defaultPos: { x: number; y: number },
  tLive: number = t
): ResolvedCharacter[] {
  const result: ResolvedCharacter[] = [];
  for (const characterId of characterIds) {
    const appearance = trackClips(tracks, "character", characterId).sort((a, b) => a.startMs - b.startMs);
    const activeAtFrozenT = appearance.find((c) => t >= c.startMs && t <= c.startMs + c.durationMs);
    const activeComponent = activeAtFrozenT?.component.kind === "animation" ? activeAtFrozenT.component : undefined;
    const effT = activeComponent?.pausesForDialogue === false ? tLive : t;

    const activeKeys = positionKeys.filter((k) => k.characterId === characterId && k.axis === "active");
    if (!resolveActiveChannel(activeKeys, effT)) continue; // not present on stage at this moment

    const xKeys = positionKeys.filter((k) => k.characterId === characterId && k.axis === "x");
    const yKeys = positionKeys.filter((k) => k.characterId === characterId && k.axis === "y");
    const x = resolveChannel(xKeys, effT, defaultPos.x);
    const y = resolveChannel(yKeys, effT, defaultPos.y);

    const activeClip = appearance.find((c) => effT >= c.startMs && effT <= c.startMs + c.durationMs);
    const active = activeClip?.component.kind === "animation" ? activeClip.component : undefined;
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

export interface OverlayState {
  opacity: number;
  color: string;
}

// Screen fade/flash overlay state at time `t` (or `tLive` for a clip whose own
// `pausesForDialogue` is false -- decided independently per clip since, unlike camera/character
// position channels, there's no cross-clip carry-over to keep consistent). Fade ramps opacity
// linearly across durationMs ("out" = fading to black, "in" = fading up from black); flash
// spikes 0 -> 1 -> 0 in a triangle wave peaking at the clip's midpoint. If two clips' windows
// overlap (unusual), the last one in the track's clip list wins -- simplicity over correctness
// for this rare edge case.
export function resolveOverlay(tracks: CutsceneTrack[], t: number, tLive: number = t): OverlayState {
  let result: OverlayState = { opacity: 0, color: "#000000" };
  for (const c of trackClips(tracks, "audiofx")) {
    if (c.component.kind !== "audio") continue;
    const audio = c.component;
    if (audio.audioKind !== "fade" && audio.audioKind !== "flash") continue;
    const effT = audio.pausesForDialogue === false ? tLive : t;
    const dur = Math.max(1, c.durationMs);
    if (effT < c.startMs || effT > c.startMs + dur) continue;
    const f = (effT - c.startMs) / dur;
    if (audio.audioKind === "fade") {
      result = { opacity: audio.direction === "in" ? 1 - f : f, color: "#000000" };
    } else {
      result = { opacity: f < 0.5 ? f * 2 : (1 - f) * 2, color: audio.color ?? "#ffffff" };
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
  for (const track of entry.cutsceneTracks ?? []) {
    for (const c of track.clips) ends.push(c.startMs + c.durationMs);
  }
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
  for (const track of entry.cutsceneTracks ?? []) {
    for (const c of track.clips) {
      set.add(c.startMs);
      set.add(c.startMs + c.durationMs);
    }
  }
  for (const k of entry.cutsceneCameraPosX ?? []) set.add(k.atMs);
  for (const k of entry.cutsceneCameraPosY ?? []) set.add(k.atMs);
  for (const k of entry.cutsceneCameraZoomKeys ?? []) set.add(k.atMs);
  for (const k of entry.cutsceneCharacterPositionKeys ?? []) set.add(k.atMs);
  return Array.from(set).sort((a, b) => a - b);
}
