import { create } from "zustand";
import type { ItemObject, Project } from "../types/database";
import { sampleProject } from "../data/sampleProject";

interface OpenTab {
  kind: "item";
  id: string; // ItemObject.id
}

interface ProjectState {
  project: Project;
  openTabs: OpenTab[];
  activeTabIndex: number;
  selectedId: string | null;
  saving: boolean;

  openItem: (id: string) => void;
  closeTab: (index: number) => void;
  setActiveTab: (index: number) => void;
  updateItem: (id: string, patch: Partial<ItemObject>) => void;
  updateItemStat: (id: string, key: string, value: number | undefined) => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export const useProjectStore = create<ProjectState>((set, get) => ({
  project: sampleProject,
  openTabs: [],
  activeTabIndex: -1,
  selectedId: null,
  saving: false,

  openItem: (id) => {
    const tabs = get().openTabs;
    const existing = tabs.findIndex((t) => t.kind === "item" && t.id === id);
    if (existing >= 0) {
      set({ activeTabIndex: existing, selectedId: id });
      return;
    }
    set({
      openTabs: [...tabs, { kind: "item", id }],
      activeTabIndex: tabs.length,
      selectedId: id,
    });
  },

  closeTab: (index) => {
    const tabs = [...get().openTabs];
    tabs.splice(index, 1);
    const active = get().activeTabIndex;
    const nextActive = tabs.length === 0 ? -1 : Math.min(active, tabs.length - 1);
    set({
      openTabs: tabs,
      activeTabIndex: nextActive,
      selectedId: nextActive >= 0 ? tabs[nextActive].id : null,
    });
  },

  setActiveTab: (index) => {
    const tab = get().openTabs[index];
    set({ activeTabIndex: index, selectedId: tab ? tab.id : null });
  },

  // Autosave rule (docs/01_Project_Rules.md #8) — no Save button, every change persists immediately.
  updateItem: (id, patch) => {
    set((s) => ({
      project: {
        ...s.project,
        items: s.project.items.map((it) => (it.id === id ? { ...it, ...patch, modified: new Date().toISOString() } : it)),
      },
    }));
    triggerAutosavePulse(set);
  },

  updateItemStat: (id, key, value) => {
    set((s) => ({
      project: {
        ...s.project,
        items: s.project.items.map((it) => {
          if (it.id !== id) return it;
          const stats = { ...it.stats };
          if (value === undefined || Number.isNaN(value)) {
            delete stats[key];
          } else {
            stats[key] = value;
          }
          return { ...it, stats, modified: new Date().toISOString() };
        }),
      },
    }));
    triggerAutosavePulse(set);
  },
}));

function triggerAutosavePulse(set: (partial: Partial<ProjectState>) => void) {
  set({ saving: true });
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => set({ saving: false }), 500);
}
