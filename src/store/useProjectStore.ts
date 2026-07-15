import { create } from "zustand";
import type { Category, Dialogue, DialogueChoice, DialogueColorStyle, DialogueFlagDef, DialogueLine, DialogueNode, Entry, Project, StatPreset, UiSettings } from "../types/database";
import { sampleProject } from "../data/sampleProject";
import { saveProjectData } from "../cloud/projects";
import { createChoice, createDialogue as makeDialogue, createLine, createNode, normalizeDialogue } from "../lib/dialogueDefaults";
import { nextId } from "../lib/mapDefaults";
import { normalizeSceneEntry } from "../lib/sceneDefaults";

interface EntryTab {
  kind: "entry";
  id: string;
}

type Tab = EntryTab;

interface ProjectState {
  project: Project;
  projectId: string | null; // Supabase projects.id — null while working on the local-only demo project
  openTabs: Tab[];
  activeTabIndex: number; // -1 means a pinned view (Gallery/Graph/Dialogues) is active — see workspaceView
  activeCategory: Category | "all";
  galleryQuery: string;
  hiddenCategories: Category[];
  workspaceView: "gallery" | "graph" | "dialogues" | "quests" | "scenes";
  activeDialogueId: string | null;
  saving: boolean;
  // Ephemeral cross-window navigation request — set when a dialogue-relation dot/chip
  // elsewhere (e.g. the Quests roadmap card) is clicked, so DialogueCanvas can pan+ripple to
  // the exact node once it mounts for that dialogue. Not project content, so it isn't part of
  // Project/persisted — it's pure UI intent, cleared once consumed.
  pendingDialogueNodeFocus: { dialogueId: string; nodeId: string; token: number } | null;
  // Undo/redo history — plain snapshots of past/future `project` values, populated by the
  // subscribe() watcher set up right after this store is created (see below), not by each
  // individual action. Ephemeral like everything else on this interface above `project`
  // itself, cleared whenever a (different) project is loaded or closed.
  undoStack: Project[];
  redoStack: Project[];

  loadProject: (id: string, data: Project) => void;
  closeProject: () => void;
  undo: () => void;
  redo: () => void;
  setCategory: (c: Category | "all") => void;
  setGalleryQuery: (q: string) => void;
  showGallery: () => void;
  showGraph: () => void;
  showDialogues: () => void;
  showQuests: () => void;
  showScenes: () => void;
  requestDialogueNodeFocus: (dialogueId: string, nodeId: string) => void;
  clearDialogueNodeFocus: () => void;
  openEntry: (id: string) => void;
  closeTab: (index: number) => void;
  setActiveTab: (index: number) => void;
  createEntry: (category: Category) => string;
  updateEntry: (id: string, patch: Partial<Entry>) => void;
  updateStat: (id: string, key: string, value: number | undefined) => void;
  deleteEntry: (id: string) => void;
  deleteEntries: (ids: string[]) => void;
  toggleCategoryVisibility: (c: Category) => void;
  addChapter: (name: string) => void;
  removeChapter: (name: string) => void;

  // ---- dialogues ----
  setActiveDialogue: (id: string | null) => void;
  createDialogueFolder: (name: string, parentId: string | null) => void;
  renameDialogueFolder: (id: string, name: string) => void;
  deleteDialogueFolder: (id: string) => void;
  moveDialogueFolder: (id: string, newParentId: string | null) => void;
  createDialogue: (name: string, folderId: string | null) => string;
  renameDialogue: (id: string, name: string) => void;
  updateDialogue: (id: string, patch: Partial<Dialogue>) => void;
  deleteDialogue: (id: string) => void;
  moveDialogueToFolder: (id: string, folderId: string | null) => void;
  addDialogueNode: (dialogueId: string, x: number, y: number) => string;
  // Bulk append of fully-formed nodes (ids/lines/choices already resolved by the caller) — used
  // by DialogueCanvas's Ctrl+V paste, which needs to insert several complete cloned nodes (with
  // internal links already remapped to fresh ids) in one shot rather than one default-empty
  // node at a time like addDialogueNode.
  addDialogueNodesRaw: (dialogueId: string, nodes: DialogueNode[]) => void;
  updateDialogueNode: (dialogueId: string, nodeId: string, patch: Partial<DialogueNode>) => void;
  deleteDialogueNode: (dialogueId: string, nodeId: string) => void;
  deleteDialogueNodes: (dialogueId: string, nodeIds: string[]) => void;
  setDialogueStartNode: (dialogueId: string, nodeId: string) => void;
  addDialogueLine: (dialogueId: string, nodeId: string) => void;
  updateDialogueLine: (dialogueId: string, nodeId: string, lineId: string, patch: Partial<DialogueLine>) => void;
  deleteDialogueLine: (dialogueId: string, nodeId: string, lineId: string) => void;
  addDialogueChoice: (dialogueId: string, nodeId: string) => void;
  updateDialogueChoice: (dialogueId: string, nodeId: string, choiceId: string, patch: Partial<DialogueChoice>) => void;
  deleteDialogueChoice: (dialogueId: string, nodeId: string, choiceId: string) => void;
  setNodeContinuation: (dialogueId: string, nodeId: string, targetNodeId: string | undefined) => void;
  setChoiceTarget: (dialogueId: string, nodeId: string, choiceId: string, targetNodeId: string | undefined) => void;
  addDialogueFlag: (name: string, def?: Partial<DialogueFlagDef>) => void;
  setDialogueFlagDef: (name: string, patch: Partial<DialogueFlagDef>) => void;
  renameDialogueFlag: (oldName: string, newName: string) => void;
  removeDialogueFlag: (name: string) => void;
  setColorStyle: (style: DialogueColorStyle) => void;
  removeColorStyle: (name: string) => void;
  importDialogue: (dialogue: Dialogue, folderId: string | null) => void;
  // "stat"/"resist" target the equipment pools (Project.statPresets/resistPresets); the
  // "character*" variants target the separate character-only pools (see StatPreset's doc
  // comment in types/database.ts for why these are kept apart).
  addStatPreset: (
    kind: "stat" | "resist" | "characterStat" | "characterResist",
    preset: Omit<StatPreset, "id">
  ) => void;
  removeStatPreset: (kind: "stat" | "resist" | "characterStat" | "characterResist", id: string) => void;
  setQuestGraphPosition: (nodeId: string, x: number, y: number) => void;
  clearQuestGraphPositions: () => void;
  setQuestGraphGridEnabled: (enabled: boolean) => void;
  setQuestChapterWidth: (chapterKey: string, width: number) => void;
  setQuestChapterHeight: (chapterKey: string, height: number) => void;
  updateUiSettings: (patch: Partial<UiSettings>) => void;
  resetDeleteConfirmSuppression: () => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let cloudTimer: ReturnType<typeof setTimeout> | null = null;
// Suppresses the undo/redo history subscription (set up right after this store, at the bottom
// of this file) while undo()/redo() themselves are writing `project` — otherwise stepping
// backward through history would immediately push a new history entry for that very write.
let isTimeTraveling = false;

export const useProjectStore = create<ProjectState>((set, get) => ({
  project: sampleProject,
  projectId: null,
  openTabs: [],
  activeTabIndex: -1,
  activeCategory: "all",
  galleryQuery: "",
  hiddenCategories: [],
  workspaceView: "gallery",
  activeDialogueId: null,
  pendingDialogueNodeFocus: null,
  undoStack: [],
  redoStack: [],
  saving: false,

  loadProject: (id, data) => {
    // Backward compatibility: projects saved before a field existed on the model come back
    // from Supabase without it — never let older cloud data crash newer UI.
    const safe: Project = {
      ...data,
      chapters: data.chapters ?? [],
      dialogueFolders: data.dialogueFolders ?? [],
      dialogues: (data.dialogues ?? []).map(normalizeDialogue),
      dialogueFlags: data.dialogueFlags ?? [],
      dialogueFlagDefs: data.dialogueFlagDefs ?? {},
      colorStyles: data.colorStyles ?? [],
      statPresets: data.statPresets ?? [],
      resistPresets: data.resistPresets ?? [],
      characterStatPresets: data.characterStatPresets ?? [],
      characterResistPresets: data.characterResistPresets ?? [],
      entries: data.entries.map((e) => normalizeSceneEntry({ ...e, tags: e.tags ?? [], references: e.references ?? [] })),
    };
    set({
      projectId: id,
      project: safe,
      openTabs: [],
      activeTabIndex: -1,
      activeCategory: "all",
      activeDialogueId: null,
      undoStack: [],
      redoStack: [],
    });
  },
  closeProject: () => {
    if (cloudTimer) clearTimeout(cloudTimer);
    set({
      projectId: null,
      project: sampleProject,
      openTabs: [],
      activeTabIndex: -1,
      activeCategory: "all",
      activeDialogueId: null,
      undoStack: [],
      redoStack: [],
    });
  },
  undo: () => {
    const { undoStack, redoStack, project } = get();
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    isTimeTraveling = true;
    set({ project: prev, undoStack: undoStack.slice(0, -1), redoStack: [...redoStack, project] });
    isTimeTraveling = false;
  },
  redo: () => {
    const { undoStack, redoStack, project } = get();
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    isTimeTraveling = true;
    set({ project: next, redoStack: redoStack.slice(0, -1), undoStack: [...undoStack, project] });
    isTimeTraveling = false;
  },
  setCategory: (c) => set({ activeCategory: c, activeTabIndex: -1, workspaceView: "gallery" }),
  setGalleryQuery: (q) => set({ galleryQuery: q }),
  showGallery: () => set({ activeTabIndex: -1, workspaceView: "gallery" }),
  showGraph: () => set({ activeTabIndex: -1, workspaceView: "graph" }),
  showDialogues: () => set({ activeTabIndex: -1, workspaceView: "dialogues" }),
  showQuests: () => set({ activeTabIndex: -1, workspaceView: "quests" }),
  showScenes: () => set({ activeTabIndex: -1, workspaceView: "scenes" }),

  requestDialogueNodeFocus: (dialogueId, nodeId) =>
    set({
      activeTabIndex: -1,
      workspaceView: "dialogues",
      activeDialogueId: dialogueId,
      pendingDialogueNodeFocus: { dialogueId, nodeId, token: Date.now() },
    }),
  clearDialogueNodeFocus: () => set({ pendingDialogueNodeFocus: null }),

  openEntry: (id) => {
    const tabs = get().openTabs;
    const existing = tabs.findIndex((t) => t.id === id);
    if (existing >= 0) {
      set({ activeTabIndex: existing });
      return;
    }
    set({ openTabs: [...tabs, { kind: "entry", id }], activeTabIndex: tabs.length });
  },

  closeTab: (index) => {
    const tabs = [...get().openTabs];
    tabs.splice(index, 1);
    const active = get().activeTabIndex;
    const nextActive = tabs.length === 0 ? -1 : Math.min(active, tabs.length - 1);
    set({ openTabs: tabs, activeTabIndex: nextActive });
  },

  setActiveTab: (index) => set({ activeTabIndex: index }),

  createEntry: (category) => {
    const id = `new_${category}_${Date.now().toString(36)}`;
    const entry: Entry = {
      uuid: `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      id,
      category,
      version: 1,
      name: "Untitled",
      description: "",
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
      tags: [],
      references: [],
      notes: "",
      props: [],
      ...(category === "main_quest" || category === "side_quest" ? { objectives: [] } : {}),
      ...(category === "character" ? { relationship: "neutral" as const } : {}),
      ...(category === "equipment" || category === "item" || category === "object" ? { stats: {} } : {}),
      ...(category === "equipment" ? { slot: "weapon" as const, rarityId: "common", value: 0, stack: 1, quest: false } : {}),
      ...(category === "item" ? { rarityId: "common", value: 0, stack: 1, quest: false } : {}),
      ...(category === "scene" ? { sceneFlow: [], sceneTransitions: [] } : {}),
      ...(category === "cutscene"
        ? { cutsceneCameraTrack: [], cutsceneCharacterTrack: [], cutsceneDialogueTrack: [], cutsceneAudioFxTrack: [] }
        : {}),
    };
    set((s) => ({ project: { ...s.project, entries: [...s.project.entries, entry] } }));
    get().openEntry(id);
    triggerAutosavePulse(set);
    return id;
  },

  // Autosave rule (docs/01_Project_Rules.md #8) — no Save button, every change persists immediately.
  updateEntry: (id, patch) => {
    set((s) => ({
      project: {
        ...s.project,
        entries: s.project.entries.map((e) => (e.id === id ? { ...e, ...patch, modified: new Date().toISOString() } : e)),
      },
    }));
    triggerAutosavePulse(set);
  },

  updateStat: (id, key, value) => {
    set((s) => ({
      project: {
        ...s.project,
        entries: s.project.entries.map((e) => {
          if (e.id !== id) return e;
          const stats = { ...(e.stats ?? {}) };
          if (value === undefined || Number.isNaN(value)) delete stats[key];
          else stats[key] = value;
          return { ...e, stats, modified: new Date().toISOString() };
        }),
      },
    }));
    triggerAutosavePulse(set);
  },

  deleteEntry: (id) => {
    set((s) => ({
      project: { ...s.project, entries: s.project.entries.filter((e) => e.id !== id) },
      openTabs: s.openTabs.filter((t) => t.id !== id),
    }));
    triggerAutosavePulse(set);
  },

  deleteEntries: (ids) => {
    const idSet = new Set(ids);
    set((s) => ({
      project: { ...s.project, entries: s.project.entries.filter((e) => !idSet.has(e.id)) },
      openTabs: s.openTabs.filter((t) => !idSet.has(t.id)),
    }));
    triggerAutosavePulse(set);
  },

  toggleCategoryVisibility: (c) => {
    set((s) => ({
      hiddenCategories: s.hiddenCategories.includes(c)
        ? s.hiddenCategories.filter((x) => x !== c)
        : [...s.hiddenCategories, c],
    }));
  },

  addChapter: (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    set((s) => (s.project.chapters.includes(trimmed) ? s : { project: { ...s.project, chapters: [...s.project.chapters, trimmed] } }));
    triggerAutosavePulse(set);
  },

  removeChapter: (name) => {
    set((s) => ({
      project: {
        ...s.project,
        chapters: s.project.chapters.filter((c) => c !== name),
        // entries filed under the removed chapter fall back to "без главы" rather than
        // pointing at a chapter name that no longer exists anywhere in the project
        entries: s.project.entries.map((e) => (e.chapter === name ? { ...e, chapter: undefined } : e)),
      },
    }));
    triggerAutosavePulse(set);
  },

  // ---- dialogues ----
  setActiveDialogue: (id) => set({ activeDialogueId: id }),

  createDialogueFolder: (name, parentId) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const folder = { id: nextId("dlgfolder"), name: trimmed, parentId };
    set((s) => ({ project: { ...s.project, dialogueFolders: [...s.project.dialogueFolders, folder] } }));
    triggerAutosavePulse(set);
  },

  renameDialogueFolder: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    set((s) => ({
      project: { ...s.project, dialogueFolders: s.project.dialogueFolders.map((f) => (f.id === id ? { ...f, name: trimmed } : f)) },
    }));
    triggerAutosavePulse(set);
  },

  deleteDialogueFolder: (id) => {
    set((s) => {
      const folder = s.project.dialogueFolders.find((f) => f.id === id);
      const parentId = folder?.parentId ?? null;
      // Children (sub-folders + dialogues) move up to this folder's own parent rather than
      // being deleted, so removing a folder never silently destroys dialogue trees.
      return {
        project: {
          ...s.project,
          dialogueFolders: s.project.dialogueFolders.filter((f) => f.id !== id).map((f) => (f.parentId === id ? { ...f, parentId } : f)),
          dialogues: s.project.dialogues.map((d) => (d.folderId === id ? { ...d, folderId: parentId } : d)),
        },
      };
    });
    triggerAutosavePulse(set);
  },

  moveDialogueFolder: (id, newParentId) => {
    set((s) => {
      if (id === newParentId) return s;
      // Prevent creating a cycle: newParentId can't be `id` itself or any of its own descendants.
      const isDescendant = (candidateId: string | null): boolean => {
        if (candidateId === null) return false;
        if (candidateId === id) return true;
        const f = s.project.dialogueFolders.find((x) => x.id === candidateId);
        return f ? isDescendant(f.parentId) : false;
      };
      if (newParentId !== null && isDescendant(newParentId)) return s;
      return {
        project: {
          ...s.project,
          dialogueFolders: s.project.dialogueFolders.map((f) => (f.id === id ? { ...f, parentId: newParentId } : f)),
        },
      };
    });
    triggerAutosavePulse(set);
  },

  createDialogue: (name, folderId) => {
    const dialogue = makeDialogue(name.trim() || "Новый диалог", folderId);
    set((s) => ({ project: { ...s.project, dialogues: [...s.project.dialogues, dialogue] }, activeDialogueId: dialogue.id }));
    triggerAutosavePulse(set);
    return dialogue.id;
  },

  renameDialogue: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    set((s) => ({
      project: { ...s.project, dialogues: s.project.dialogues.map((d) => (d.id === id ? { ...d, name: trimmed } : d)) },
    }));
    triggerAutosavePulse(set);
  },

  updateDialogue: (id, patch) => {
    set((s) => ({
      project: { ...s.project, dialogues: s.project.dialogues.map((d) => (d.id === id ? { ...d, ...patch } : d)) },
    }));
    triggerAutosavePulse(set);
  },

  deleteDialogue: (id) => {
    set((s) => ({
      project: { ...s.project, dialogues: s.project.dialogues.filter((d) => d.id !== id) },
      activeDialogueId: s.activeDialogueId === id ? null : s.activeDialogueId,
    }));
    triggerAutosavePulse(set);
  },

  moveDialogueToFolder: (id, folderId) => {
    set((s) => ({
      project: { ...s.project, dialogues: s.project.dialogues.map((d) => (d.id === id ? { ...d, folderId } : d)) },
    }));
    triggerAutosavePulse(set);
  },

  addDialogueNode: (dialogueId, x, y) => {
    const node = createNode(x, y);
    set((s) => ({
      project: {
        ...s.project,
        dialogues: s.project.dialogues.map((d) => (d.id === dialogueId ? { ...d, nodes: [...d.nodes, node] } : d)),
      },
    }));
    triggerAutosavePulse(set);
    return node.id;
  },

  addDialogueNodesRaw: (dialogueId, nodes) => {
    set((s) => ({
      project: {
        ...s.project,
        dialogues: s.project.dialogues.map((d) => (d.id === dialogueId ? { ...d, nodes: [...d.nodes, ...nodes] } : d)),
      },
    }));
    triggerAutosavePulse(set);
  },

  updateDialogueNode: (dialogueId, nodeId, patch) => {
    set((s) => ({
      project: {
        ...s.project,
        dialogues: s.project.dialogues.map((d) =>
          d.id !== dialogueId ? d : { ...d, nodes: d.nodes.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)) }
        ),
      },
    }));
    triggerAutosavePulse(set);
  },

  deleteDialogueNode: (dialogueId, nodeId) => {
    set((s) => ({
      project: {
        ...s.project,
        dialogues: s.project.dialogues.map((d) => {
          if (d.id !== dialogueId) return d;
          const nodes = d.nodes
            .filter((n) => n.id !== nodeId)
            .map((n) => ({
              ...n,
              continueTo: n.continueTo === nodeId ? undefined : n.continueTo,
              choices: n.choices.map((c) => (c.targetNodeId === nodeId ? { ...c, targetNodeId: undefined } : c)),
            }));
          return { ...d, nodes, startNodeId: d.startNodeId === nodeId ? nodes[0]?.id ?? "" : d.startNodeId };
        }),
      },
    }));
    triggerAutosavePulse(set);
  },

  // Bulk version for marquee multi-select + Delete-key removal (DialogueCanvas.tsx) — also
  // clears dangling `line.elseNodeId` references, which the singular deleteDialogueNode above
  // doesn't (a pre-existing gap; not worth touching that one's behavior here, but a bulk delete
  // is a good place not to repeat it).
  deleteDialogueNodes: (dialogueId, nodeIds) => {
    const doomed = new Set(nodeIds);
    set((s) => ({
      project: {
        ...s.project,
        dialogues: s.project.dialogues.map((d) => {
          if (d.id !== dialogueId) return d;
          const nodes = d.nodes
            .filter((n) => !doomed.has(n.id))
            .map((n) => ({
              ...n,
              continueTo: n.continueTo && doomed.has(n.continueTo) ? undefined : n.continueTo,
              choices: n.choices.map((c) => (c.targetNodeId && doomed.has(c.targetNodeId) ? { ...c, targetNodeId: undefined } : c)),
              lines: n.lines.map((l) => (l.elseNodeId && doomed.has(l.elseNodeId) ? { ...l, elseNodeId: undefined } : l)),
            }));
          return { ...d, nodes, startNodeId: doomed.has(d.startNodeId) ? nodes[0]?.id ?? "" : d.startNodeId };
        }),
      },
    }));
    triggerAutosavePulse(set);
  },

  setDialogueStartNode: (dialogueId, nodeId) => {
    set((s) => ({
      project: {
        ...s.project,
        dialogues: s.project.dialogues.map((d) => (d.id === dialogueId ? { ...d, startNodeId: nodeId } : d)),
      },
    }));
    triggerAutosavePulse(set);
  },

  addDialogueLine: (dialogueId, nodeId) => {
    set((s) => ({
      project: {
        ...s.project,
        dialogues: s.project.dialogues.map((d) =>
          d.id !== dialogueId
            ? d
            : {
                ...d,
                nodes: d.nodes.map((n) => {
                  if (n.id !== nodeId) return n;
                  // New replicas within the SAME node default to whoever was already talking —
                  // most nodes are one character's lines in a row, so leaving speaker blank
                  // every time just meant re-picking them from the dropdown over and over.
                  const lastLine = n.lines[n.lines.length - 1];
                  const inherited = lastLine ? { speaker: lastLine.speaker, speakerEntryId: lastLine.speakerEntryId } : undefined;
                  return { ...n, lines: [...n.lines, createLine(inherited)] };
                }),
              }
        ),
      },
    }));
    triggerAutosavePulse(set);
  },

  updateDialogueLine: (dialogueId, nodeId, lineId, patch) => {
    set((s) => ({
      project: {
        ...s.project,
        dialogues: s.project.dialogues.map((d) =>
          d.id !== dialogueId
            ? d
            : {
                ...d,
                nodes: d.nodes.map((n) =>
                  n.id !== nodeId ? n : { ...n, lines: n.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)) }
                ),
              }
        ),
      },
    }));
    triggerAutosavePulse(set);
  },

  deleteDialogueLine: (dialogueId, nodeId, lineId) => {
    set((s) => ({
      project: {
        ...s.project,
        dialogues: s.project.dialogues.map((d) =>
          d.id !== dialogueId
            ? d
            : { ...d, nodes: d.nodes.map((n) => (n.id !== nodeId ? n : { ...n, lines: n.lines.filter((l) => l.id !== lineId) })) }
        ),
      },
    }));
    triggerAutosavePulse(set);
  },

  addDialogueChoice: (dialogueId, nodeId) => {
    set((s) => ({
      project: {
        ...s.project,
        dialogues: s.project.dialogues.map((d) =>
          d.id !== dialogueId
            ? d
            : { ...d, nodes: d.nodes.map((n) => (n.id === nodeId ? { ...n, choices: [...n.choices, createChoice()] } : n)) }
        ),
      },
    }));
    triggerAutosavePulse(set);
  },

  updateDialogueChoice: (dialogueId, nodeId, choiceId, patch) => {
    set((s) => ({
      project: {
        ...s.project,
        dialogues: s.project.dialogues.map((d) =>
          d.id !== dialogueId
            ? d
            : {
                ...d,
                nodes: d.nodes.map((n) =>
                  n.id !== nodeId ? n : { ...n, choices: n.choices.map((c) => (c.id === choiceId ? { ...c, ...patch } : c)) }
                ),
              }
        ),
      },
    }));
    triggerAutosavePulse(set);
  },

  deleteDialogueChoice: (dialogueId, nodeId, choiceId) => {
    set((s) => ({
      project: {
        ...s.project,
        dialogues: s.project.dialogues.map((d) =>
          d.id !== dialogueId
            ? d
            : { ...d, nodes: d.nodes.map((n) => (n.id !== nodeId ? n : { ...n, choices: n.choices.filter((c) => c.id !== choiceId) })) }
        ),
      },
    }));
    triggerAutosavePulse(set);
  },

  setNodeContinuation: (dialogueId, nodeId, targetNodeId) => {
    set((s) => ({
      project: {
        ...s.project,
        dialogues: s.project.dialogues.map((d) =>
          d.id !== dialogueId ? d : { ...d, nodes: d.nodes.map((n) => (n.id === nodeId ? { ...n, continueTo: targetNodeId } : n)) }
        ),
      },
    }));
    triggerAutosavePulse(set);
  },

  setChoiceTarget: (dialogueId, nodeId, choiceId, targetNodeId) => {
    set((s) => ({
      project: {
        ...s.project,
        dialogues: s.project.dialogues.map((d) =>
          d.id !== dialogueId
            ? d
            : {
                ...d,
                nodes: d.nodes.map((n) =>
                  n.id !== nodeId
                    ? n
                    : { ...n, choices: n.choices.map((c) => (c.id === choiceId ? { ...c, targetNodeId } : c)) }
                ),
              }
        ),
      },
    }));
    triggerAutosavePulse(set);
  },

  addDialogueFlag: (name, def) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const type = def?.type ?? "bool";
    const fullDef = { type, default: def?.default ?? (type === "bool" ? "false" : "0"), max: def?.max ?? (type === "number" ? 100 : undefined) };
    set((s) =>
      s.project.dialogueFlags.includes(trimmed)
        ? s
        : {
            project: {
              ...s.project,
              dialogueFlags: [...s.project.dialogueFlags, trimmed],
              dialogueFlagDefs: { ...s.project.dialogueFlagDefs, [trimmed]: s.project.dialogueFlagDefs[trimmed] ?? fullDef },
            },
          }
    );
    triggerAutosavePulse(set);
  },

  setDialogueFlagDef: (name, patch) => {
    set((s) => {
      const current = s.project.dialogueFlagDefs[name] ?? { type: "bool" as const, default: "false" };
      return {
        project: { ...s.project, dialogueFlagDefs: { ...s.project.dialogueFlagDefs, [name]: { ...current, ...patch } } },
      };
    });
    triggerAutosavePulse(set);
  },

  renameDialogueFlag: (oldName, newName) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return;
    set((s) => {
      const nextDefs = { ...s.project.dialogueFlagDefs };
      if (oldName in nextDefs) {
        nextDefs[trimmed] = nextDefs[oldName];
        delete nextDefs[oldName];
      }
      return {
        project: {
          ...s.project,
          dialogueFlags: s.project.dialogueFlags.map((f) => (f === oldName ? trimmed : f)),
          dialogueFlagDefs: nextDefs,
          // keep every condition/flag-set that referenced the old name pointed at the new one
          dialogues: s.project.dialogues.map((d) => ({
            ...d,
            nodes: d.nodes.map((n) => ({
              ...n,
              lines: n.lines.map((l) => (l.condition?.kind === "flag" && l.condition.key === oldName ? { ...l, condition: { ...l.condition, key: trimmed } } : l)),
              choices: n.choices.map((c) => ({
                ...c,
                condition: c.condition?.kind === "flag" && c.condition.key === oldName ? { ...c.condition, key: trimmed } : c.condition,
                flagSets: c.flagSets.map((fs) => (fs.key === oldName ? { ...fs, key: trimmed } : fs)),
              })),
            })),
          })),
        },
      };
    });
    triggerAutosavePulse(set);
  },

  removeDialogueFlag: (name) => {
    set((s) => {
      const nextDefs = { ...s.project.dialogueFlagDefs };
      delete nextDefs[name];
      return {
        project: { ...s.project, dialogueFlags: s.project.dialogueFlags.filter((f) => f !== name), dialogueFlagDefs: nextDefs },
      };
    });
    triggerAutosavePulse(set);
  },

  setColorStyle: (style) => {
    const trimmed = style.name.trim();
    if (!trimmed) return;
    set((s) => {
      const existing = s.project.colorStyles.findIndex((c) => c.name === trimmed);
      const next = { ...style, name: trimmed };
      const colorStyles =
        existing >= 0
          ? s.project.colorStyles.map((c, i) => (i === existing ? next : c))
          : [...s.project.colorStyles, next];
      return { project: { ...s.project, colorStyles } };
    });
    triggerAutosavePulse(set);
  },

  removeColorStyle: (name) => {
    set((s) => ({ project: { ...s.project, colorStyles: s.project.colorStyles.filter((c) => c.name !== name) } }));
    triggerAutosavePulse(set);
  },

  importDialogue: (dialogue, folderId) => {
    const normalized = { ...normalizeDialogue(dialogue), id: nextId("dlg"), folderId };
    set((s) => ({ project: { ...s.project, dialogues: [...s.project.dialogues, normalized] }, activeDialogueId: normalized.id }));
    triggerAutosavePulse(set);
  },

  // Stat/resist presets are project-wide (shared across every equipment card, see
  // src/components/editors/EquipmentPresetsModal.tsx) rather than per-entry — same pattern as
  // rarities/chapters. Removing a preset from the library intentionally leaves any
  // Entry.statValues/resistValues entries pointing at its old id in place but orphaned; they're
  // simply never rendered again since the card only shows values for presets it can still find
  // in the library, so no extra cleanup pass is needed.
  addStatPreset: (kind, preset) => {
    const key =
      kind === "stat"
        ? "statPresets"
        : kind === "resist"
        ? "resistPresets"
        : kind === "characterStat"
        ? "characterStatPresets"
        : "characterResistPresets";
    const idPrefix = kind === "stat" || kind === "characterStat" ? "stat" : "res";
    const withId: StatPreset = { ...preset, id: nextId(idPrefix) };
    set((s) => ({ project: { ...s.project, [key]: [...s.project[key], withId] } }));
    triggerAutosavePulse(set);
  },

  removeStatPreset: (kind, id) => {
    const key =
      kind === "stat"
        ? "statPresets"
        : kind === "resist"
        ? "resistPresets"
        : kind === "characterStat"
        ? "characterStatPresets"
        : "characterResistPresets";
    set((s) => ({ project: { ...s.project, [key]: s.project[key].filter((p) => p.id !== id) } }));
    triggerAutosavePulse(set);
  },

  // Called once per node on drag-release (not every frame) — see onNodePointerDown's onUp in
  // QuestsView.tsx's RoadmapGraph.
  setQuestGraphPosition: (nodeId, x, y) => {
    set((s) => ({
      project: {
        ...s.project,
        questGraphPositions: { ...(s.project.questGraphPositions ?? {}), [nodeId]: { x, y } },
      },
    }));
    triggerAutosavePulse(set);
  },

  clearQuestGraphPositions: () => {
    set((s) => ({ project: { ...s.project, questGraphPositions: {} } }));
    triggerAutosavePulse(set);
  },

  setQuestGraphGridEnabled: (enabled) => {
    set((s) => ({ project: { ...s.project, questGraphGridEnabled: enabled } }));
    triggerAutosavePulse(set);
  },

  setQuestChapterWidth: (key, width) => {
    set((s) => ({
      project: { ...s.project, questGraphChapterWidths: { ...(s.project.questGraphChapterWidths ?? {}), [key]: width } },
    }));
    triggerAutosavePulse(set);
  },

  setQuestChapterHeight: (key, height) => {
    set((s) => ({
      project: { ...s.project, questGraphChapterHeights: { ...(s.project.questGraphChapterHeights ?? {}), [key]: height } },
    }));
    triggerAutosavePulse(set);
  },

  updateUiSettings: (patch) => {
    set((s) => ({ project: { ...s.project, uiSettings: { ...(s.project.uiSettings ?? {}), ...patch } } }));
    triggerAutosavePulse(set);
  },

  // "Reset dismissed warnings" in the new Settings panel — clears the global delete-confirm
  // suppression AND every individual dialogue's per-dialogue suppression flag in one go, so a
  // writer who clicked through a bunch of "не спрашивать" checkboxes can get the modal back
  // everywhere without having to track down which dialogues they touched.
  resetDeleteConfirmSuppression: () => {
    set((s) => ({
      project: {
        ...s.project,
        uiSettings: { ...(s.project.uiSettings ?? {}), skipDeleteConfirmGlobal: false },
        dialogues: s.project.dialogues.map((d) => (d.skipDeleteConfirm ? { ...d, skipDeleteConfirm: false } : d)),
      },
    }));
    triggerAutosavePulse(set);
  },
}));

function triggerAutosavePulse(set: (partial: Partial<ProjectState>) => void) {
  set({ saving: true });
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => set({ saving: false }), 500);

  // Debounced cloud sync (docs/01_Project_Rules.md #8: autosave, no Save button).
  // Reads current state lazily so this file never needs zustand's `get` outside actions.
  if (cloudTimer) clearTimeout(cloudTimer);
  cloudTimer = setTimeout(() => {
    const { project, projectId } = useProjectStore.getState();
    if (projectId) saveProjectData(projectId, project).catch((e) => console.error("cloud save failed", e));
  }, 900);
}

// ---- Undo/redo history ----
// Rather than touching every one of the many dozens of individual mutating actions above (all
// of which already funnel through triggerAutosavePulse, but by the time that runs the OLD
// `project` value is already gone), this subscribes to the store directly — a plain Zustand
// subscription gets both the previous AND next state on every change, which is exactly what
// "did `project` change, and if so what was it a moment ago" needs, with zero changes to any
// action above. Rapid-fire changes (typing into a text field fires one `project` change per
// keystroke) are coalesced into a single history entry via a short debounce window, so undo
// reverts "that edit" rather than replaying it one character at a time.
let lastHistoryPushAt = 0;
const HISTORY_DEBOUNCE_MS = 400;
const HISTORY_LIMIT = 60;

useProjectStore.subscribe((state, prevState) => {
  if (isTimeTraveling) return;
  if (state.project === prevState.project) return;
  // Loading or closing a project also swaps `project` wholesale — that's not an edit to undo,
  // it's a different document entirely, and loadProject/closeProject already reset both stacks
  // themselves.
  if (state.projectId !== prevState.projectId) return;
  const now = Date.now();
  const coalesce = now - lastHistoryPushAt < HISTORY_DEBOUNCE_MS && state.undoStack.length > 0;
  lastHistoryPushAt = now;
  if (coalesce) {
    if (state.redoStack.length > 0) useProjectStore.setState({ redoStack: [] });
    return;
  }
  useProjectStore.setState({
    undoStack: [...state.undoStack, prevState.project].slice(-HISTORY_LIMIT),
    redoStack: [],
  });
});
