import { create } from "zustand";
import type { Category, Dialogue, DialogueChoice, DialogueColorStyle, DialogueLine, DialogueNode, Entry, Project } from "../types/database";
import { sampleProject } from "../data/sampleProject";
import { saveProjectData } from "../cloud/projects";
import { createChoice, createDialogue as makeDialogue, createLine, createNode, normalizeDialogue } from "../lib/dialogueDefaults";
import { nextId } from "../lib/mapDefaults";

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
  workspaceView: "gallery" | "graph" | "dialogues" | "quests";
  activeDialogueId: string | null;
  saving: boolean;

  loadProject: (id: string, data: Project) => void;
  closeProject: () => void;
  setCategory: (c: Category | "all") => void;
  setGalleryQuery: (q: string) => void;
  showGallery: () => void;
  showGraph: () => void;
  showDialogues: () => void;
  showQuests: () => void;
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

  // ---- dialogues ----
  setActiveDialogue: (id: string | null) => void;
  createDialogueFolder: (name: string, parentId: string | null) => void;
  renameDialogueFolder: (id: string, name: string) => void;
  deleteDialogueFolder: (id: string) => void;
  moveDialogueFolder: (id: string, newParentId: string | null) => void;
  createDialogue: (name: string, folderId: string | null) => string;
  renameDialogue: (id: string, name: string) => void;
  deleteDialogue: (id: string) => void;
  moveDialogueToFolder: (id: string, folderId: string | null) => void;
  addDialogueNode: (dialogueId: string, x: number, y: number) => string;
  updateDialogueNode: (dialogueId: string, nodeId: string, patch: Partial<DialogueNode>) => void;
  deleteDialogueNode: (dialogueId: string, nodeId: string) => void;
  setDialogueStartNode: (dialogueId: string, nodeId: string) => void;
  addDialogueLine: (dialogueId: string, nodeId: string) => void;
  updateDialogueLine: (dialogueId: string, nodeId: string, lineId: string, patch: Partial<DialogueLine>) => void;
  deleteDialogueLine: (dialogueId: string, nodeId: string, lineId: string) => void;
  addDialogueChoice: (dialogueId: string, nodeId: string) => void;
  updateDialogueChoice: (dialogueId: string, nodeId: string, choiceId: string, patch: Partial<DialogueChoice>) => void;
  deleteDialogueChoice: (dialogueId: string, nodeId: string, choiceId: string) => void;
  setNodeContinuation: (dialogueId: string, nodeId: string, targetNodeId: string | undefined) => void;
  setChoiceTarget: (dialogueId: string, nodeId: string, choiceId: string, targetNodeId: string | undefined) => void;
  addDialogueFlag: (name: string) => void;
  renameDialogueFlag: (oldName: string, newName: string) => void;
  removeDialogueFlag: (name: string) => void;
  setColorStyle: (style: DialogueColorStyle) => void;
  removeColorStyle: (name: string) => void;
  importDialogue: (dialogue: Dialogue, folderId: string | null) => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let cloudTimer: ReturnType<typeof setTimeout> | null = null;

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
      colorStyles: data.colorStyles ?? [],
      entries: data.entries.map((e) => ({ ...e, tags: e.tags ?? [], references: e.references ?? [] })),
    };
    set({ projectId: id, project: safe, openTabs: [], activeTabIndex: -1, activeCategory: "all", activeDialogueId: null });
  },
  closeProject: () => {
    if (cloudTimer) clearTimeout(cloudTimer);
    set({ projectId: null, project: sampleProject, openTabs: [], activeTabIndex: -1, activeCategory: "all", activeDialogueId: null });
  },
  setCategory: (c) => set({ activeCategory: c, activeTabIndex: -1, workspaceView: "gallery" }),
  setGalleryQuery: (q) => set({ galleryQuery: q }),
  showGallery: () => set({ activeTabIndex: -1, workspaceView: "gallery" }),
  showGraph: () => set({ activeTabIndex: -1, workspaceView: "graph" }),
  showDialogues: () => set({ activeTabIndex: -1, workspaceView: "dialogues" }),
  showQuests: () => set({ activeTabIndex: -1, workspaceView: "quests" }),

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
            : { ...d, nodes: d.nodes.map((n) => (n.id === nodeId ? { ...n, lines: [...n.lines, createLine()] } : n)) }
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

  addDialogueFlag: (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    set((s) => (s.project.dialogueFlags.includes(trimmed) ? s : { project: { ...s.project, dialogueFlags: [...s.project.dialogueFlags, trimmed] } }));
    triggerAutosavePulse(set);
  },

  renameDialogueFlag: (oldName, newName) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return;
    set((s) => ({
      project: {
        ...s.project,
        dialogueFlags: s.project.dialogueFlags.map((f) => (f === oldName ? trimmed : f)),
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
    }));
    triggerAutosavePulse(set);
  },

  removeDialogueFlag: (name) => {
    set((s) => ({
      project: { ...s.project, dialogueFlags: s.project.dialogueFlags.filter((f) => f !== name) },
    }));
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
