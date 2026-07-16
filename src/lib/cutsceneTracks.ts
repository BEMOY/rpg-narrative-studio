import type { CutsceneCastMember, CutsceneClip, CutsceneComponent, CutsceneTrack, CutsceneTrackKind, Entry } from "../types/database";
import { nextId } from "./mapDefaults";

// Small pure-function API around the generic Track+Clip+Component model (see the doc comment
// above CutsceneTrackKind in types/database.ts) -- every file that used to reach directly into
// entry.cutsceneCameraTrack / cutsceneCharacterTrack / cutsceneDialogueTrack / cutsceneAudioFxTrack
// now goes through these instead, so "find the camera track", "add a clip to a character's
// track", etc. are each written exactly once.

// Finds a track by kind (and, for "character" tracks, by which character it belongs to -- there
// can be many character tracks, one per cast member, but only ever one camera/dialogue/audiofx
// track).
export function findTrack(tracks: CutsceneTrack[], kind: CutsceneTrackKind, characterId?: string): CutsceneTrack | undefined {
  return tracks.find((t) => t.kind === kind && (kind !== "character" || t.characterId === characterId));
}

export function trackClips(tracks: CutsceneTrack[], kind: CutsceneTrackKind, characterId?: string): CutsceneClip[] {
  return findTrack(tracks, kind, characterId)?.clips ?? [];
}

// Returns a new tracks[] with the given track's clip list replaced -- creates the track (starting
// from empty) if it doesn't exist yet, so callers never need to separately "ensure a track
// exists" before adding a clip to it (mirrors how cutsceneCastCharacterIds used to be the only
// thing keeping an empty character lane visible -- now an empty CutsceneTrack does the same job).
export function withTrackClips(tracks: CutsceneTrack[], kind: CutsceneTrackKind, clips: CutsceneClip[], characterId?: string): CutsceneTrack[] {
  const existing = findTrack(tracks, kind, characterId);
  if (existing) return tracks.map((t) => (t.id === existing.id ? { ...t, clips } : t));
  return [...tracks, { id: nextId("track"), kind, characterId, clips }];
}

export function addClip(
  tracks: CutsceneTrack[],
  kind: CutsceneTrackKind,
  startMs: number,
  durationMs: number,
  component: CutsceneComponent,
  characterId?: string
): CutsceneTrack[] {
  const clip: CutsceneClip = { id: nextId("clip"), startMs, durationMs, component };
  return withTrackClips(tracks, kind, [...trackClips(tracks, kind, characterId), clip], characterId);
}

export function updateClip(
  tracks: CutsceneTrack[],
  kind: CutsceneTrackKind,
  clipId: string,
  patch: Partial<Omit<CutsceneClip, "component">> & { component?: Partial<CutsceneComponent> },
  characterId?: string
): CutsceneTrack[] {
  const clips = trackClips(tracks, kind, characterId).map((c) =>
    c.id === clipId ? { ...c, ...patch, component: patch.component ? ({ ...c.component, ...patch.component } as CutsceneComponent) : c.component } : c
  );
  return withTrackClips(tracks, kind, clips, characterId);
}

export function removeClip(tracks: CutsceneTrack[], kind: CutsceneTrackKind, clipId: string, characterId?: string): CutsceneTrack[] {
  return withTrackClips(
    tracks,
    kind,
    trackClips(tracks, kind, characterId).filter((c) => c.id !== clipId),
    characterId
  );
}

// Ensures a (possibly still-empty) track exists for this character -- used when a character is
// added to the cast so its lane shows up even before any clip is placed on it.
export function ensureCharacterTrack(tracks: CutsceneTrack[], characterId: string): CutsceneTrack[] {
  if (findTrack(tracks, "character", characterId)) return tracks;
  return [...tracks, { id: nextId("track"), kind: "character", characterId, clips: [] }];
}

export function removeCharacterTrack(tracks: CutsceneTrack[], characterId: string): CutsceneTrack[] {
  return tracks.filter((t) => !(t.kind === "character" && t.characterId === characterId));
}

// Locates a single clip by id, searching all tracks of that kind (used by ClipInspector, which
// only has a clip id + a trackKind to go on, not which specific track -- for "character" clips it
// also needs the owning track's characterId, which this returns alongside).
export function findClipAnywhere(
  tracks: CutsceneTrack[],
  kind: CutsceneTrackKind,
  clipId: string
): { track: CutsceneTrack; clip: CutsceneClip } | undefined {
  for (const t of tracks) {
    if (t.kind !== kind) continue;
    const clip = t.clips.find((c) => c.id === clipId);
    if (clip) return { track: t, clip };
  }
  return undefined;
}

// -- Cast (v75 "Персонажи + Объекты/Предметы" + duplicate-instance rework) --
// A cast member is one placed ACTOR instance on the cutscene stage -- see the doc comment on
// CutsceneCastMember in types/database.ts for why this is a separate instanceId rather than the
// underlying Entry's own id (it's what makes placing the SAME character/object/item twice work
// without the two instances colliding on every character-track/keyframe/color lookup, which are
// all keyed by instanceId).

// Always creates a brand-new instance, even if this exact entryId is already in the cast --
// that's the whole point (duplicates must work). Callers still need to ensureCharacterTrack(...)
// with the returned instanceId so the lane actually shows up.
export function addCastMember(cast: CutsceneCastMember[], entryId: string): { cast: CutsceneCastMember[]; instanceId: string } {
  const instanceId = nextId("actor");
  return { cast: [...cast, { instanceId, entryId }], instanceId };
}

// Removes one instance (and only that one -- a duplicate sharing the same entryId is untouched)
// from the cast list. Callers are still responsible for also stripping that instanceId's
// character track / position keys / color entry, same as the old "remove character" flow did.
export function removeCastMember(cast: CutsceneCastMember[], instanceId: string): CutsceneCastMember[] {
  return cast.filter((m) => m.instanceId !== instanceId);
}

// Display label for one cast instance -- falls back to "(отсутствует)" if its Entry was deleted
// from the project elsewhere. Appends "#2", "#3", ... when more than one instance in this cast
// shares the same underlying entryId, so duplicate objects/characters stay distinguishable in the
// timeline's row headers, the Explorer picker, and the Inspector -- ordered by each instance's
// position in the cast list (first placed = #1, left unlabeled).
export function castLabel(cast: CutsceneCastMember[], allEntries: Entry[], instanceId: string): string {
  const member = cast.find((m) => m.instanceId === instanceId);
  if (!member) return "(отсутствует)";
  const entry = allEntries.find((e) => e.id === member.entryId);
  const name = entry?.name ?? "(отсутствует)";
  const sameEntry = cast.filter((m) => m.entryId === member.entryId);
  if (sameEntry.length <= 1) return name;
  const idx = sameEntry.findIndex((m) => m.instanceId === instanceId);
  return `${name} #${idx + 1}`;
}
