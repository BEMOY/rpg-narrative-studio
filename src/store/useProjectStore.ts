import { create } from "zustand";
import type { Category, Entry, Project } from "../types/database";
import { sampleProject } from "../data/sampleProject";
import { saveProjectData } from "../cloud/projects";

interface EntryTab {
  kind: "entry";
  id: string;
}

type Tab = EntryTab;

interface ProjectState {
  project: Project;
  projectId: string | null; // Supabase projects.id — null while working on the local-only demo project
  openTabs: Tab[];
  activeTabIndex: number; // -1 means the pinned Gallery view is active
  activeCategory: Category | "all";
  galleryQuery: string;
  saving: boolean;

  loadProject: (id: string, data: Project) => void;
  closeProject: () => void;
  setCategory: (c: Category | "all") => void;
  setGalleryQuery: (q: string) => void;
  showGallery: () => void;
  openEntry: (id: string) => void;
  closeTab: (index: number) => void;
  setActiveTab: (index: number) => void;
  createEntry: (category: Category) => string;
  updateEntry: (id: string, patch: Partial<Entry>) => void;
  updateStat: (id: string, key: string, value: number | undefined) => void;
  deleteEntry: (id: string) => void;
  addChapter: (name: string) => void;
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
  saving: false,

  loadProject: (id, data) => {
    // Backward compatibility: projects saved before a field existed on the model come back
    // from Supabase without it — never let older cloud data crash newer UI.
    const safe: Project = {
      ...data,
      chapters: data.chapters ?? [],
      entries: data.entries.map((e) => ({ ...e, tags: e.tags ?? [], references: e.references ?? [] })),
    };
    set({ projectId: id, project: safe, openTabs: [], activeTabIndex: -1, activeCategory: "all" });
  },
  closeProject: () => {
    if (cloudTimer) clearTimeout(cloudTimer);
    set({ projectId: null, project: sampleProject, openTabs: [], activeTabIndex: -1, activeCategory: "all" });
  },
  setCategory: (c) => set({ activeCategory: c, activeTabIndex: -1 }),
  setGalleryQuery: (q) => set({ galleryQuery: q }),
  showGallery: () => set({ activeTabIndex: -1 }),

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

  addChapter: (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    set((s) => (s.project.chapters.includes(trimmed) ? s : { project: { ...s.project, chapters: [...s.project.chapters, trimmed] } }));
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
