// A tiny shared flag, NOT React state — the map editor keeps its own local, fine-grained
// undo/redo history (per brush stroke/paint op, see pastRef/futureRef in MapEditorModal.tsx),
// completely separate from the app-wide PROJECT undo/redo (App.tsx, whole-project checkpoints
// every ~400ms). Both used to listen for Ctrl+Z/Ctrl+Y on `window`, and since the app-wide
// listener is mounted once at the root (registered first), it always fired FIRST and consumed
// the keystroke before the map editor's own handler ever got a chance — so undo while drawing
// silently reverted an unrelated whole-project checkpoint instead of the last stroke, or did
// nothing useful at all. This flag lets the app-wide handler simply skip itself while a map
// editor is open, deferring entirely to the map editor's own local undo/redo.
export const mapEditorFocusState = { active: false };
