import type { MapData, MapFreehandLayer, MapObjectLayer, MapPaletteColor, MapTileLayer, MapZoneLayer } from "../types/database";

export function cellKey(x: number, y: number): string {
  return `${x}:${y}`;
}

export function parseCellKey(key: string): { x: number; y: number } {
  const [x, y] = key.split(":").map(Number);
  return { x, y };
}

let idCounter = 0;
export function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

export function createDefaultMap(): MapData {
  const ground: MapTileLayer = {
    id: nextId("layer"),
    kind: "tile",
    name: "Пол",
    visible: true,
    locked: false,
    opacity: 1,
    cells: {},
  };
  const objects: MapObjectLayer = {
    id: nextId("layer"),
    kind: "object",
    name: "Объекты",
    visible: true,
    locked: false,
    opacity: 1,
    objects: [],
  };
  const zones: MapZoneLayer = {
    id: nextId("layer"),
    kind: "zone",
    name: "Зоны",
    visible: true,
    locked: false,
    opacity: 0.5,
    zones: [],
  };
  return {
    version: 1,
    gridSize: 32,
    width: 24,
    height: 16,
    layers: [ground, objects, zones],
    palette: DEFAULT_PALETTE.map((p) => ({ ...p })),
  };
}

export const DEFAULT_PALETTE: MapPaletteColor[] = [
  { color: "#6b7280", label: "Пол" },
  { color: "#3f3f46", label: "Стена" },
  { color: "#4d7c0f", label: "Трава" },
  { color: "#0e7490", label: "Вода" },
  { color: "#92400e", label: "Дерево/грязь" },
  { color: "#a1a1aa", label: "Камень" },
  { color: "#facc15", label: "Песок" },
  { color: "#78350f", label: "Дверной проём" },
];

// Fills in fields that didn't exist yet when an older map was saved (e.g. before the
// custom palette or freehand layers were added) — never let older saved data crash the editor.
export function normalizeMap(raw: MapData): MapData {
  return {
    ...raw,
    palette: raw.palette && raw.palette.length > 0 ? raw.palette : DEFAULT_PALETTE.map((p) => ({ ...p })),
    layers: raw.layers.map((l) => (l.kind === "tile" ? { ...l, cells: l.cells ?? {} } : l)),
  };
}

export function createFreehandLayer(): MapFreehandLayer {
  return { id: nextId("layer"), kind: "freehand", name: "Рисование", visible: true, locked: false, opacity: 1, bitmap: null };
}

export const ZONE_TAGS: { tag: string; label: string; color: string }[] = [
  { tag: "trigger", label: "Триггер", color: "#8b7bff" },
  { tag: "battle", label: "Битва", color: "#dc2626" },
  { tag: "music", label: "Смена музыки", color: "#0ea5e9" },
  { tag: "transition", label: "Переход между картами", color: "#f59e0b" },
  { tag: "spawn", label: "Точка спавна", color: "#22c55e" },
  { tag: "note", label: "Заметка дизайнера", color: "#a1a1aa" },
];
