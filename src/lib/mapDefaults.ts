import type { CSSProperties } from "react";
import type {
  MapCollisionLayer,
  MapData,
  MapFreehandLayer,
  MapImageLayer,
  MapObjectLayer,
  MapPaletteColor,
  MapTileLayer,
  MapTileValue,
  MapZoneLayer,
  Tileset,
} from "../types/database";

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
    layers: raw.layers.map((l) => {
      if (l.kind === "tile") return { ...l, cells: l.cells ?? {} };
      if (l.kind === "collision") return { ...l, cells: l.cells ?? {} };
      return l;
    }),
  };
}

export function createFreehandLayer(): MapFreehandLayer {
  return { id: nextId("layer"), kind: "freehand", name: "Рисование", visible: true, locked: false, opacity: 1, bitmap: null };
}

export function createCollisionLayer(): MapCollisionLayer {
  // 0.55 default opacity — solid enough to read as "закрашено красным", translucent enough to
  // still see the ground art underneath while painting walls over it.
  return { id: nextId("layer"), kind: "collision", name: "Коллизии", visible: true, locked: false, opacity: 0.55, cells: {} };
}

// --- v77 autotiles (see TilesetAutotile in types/database.ts for the block layout contract) ---
// 4-neighbor bitmask: bit set = the neighbor in that direction belongs to the SAME autotile
// group, i.e. the edge in that direction is internal (connected), not a border.
export const AUTOTILE_N = 1;
export const AUTOTILE_E = 2;
export const AUTOTILE_S = 4;
export const AUTOTILE_W = 8;

// Resolves which tile of a 4x4 autotile block to draw for a given cell, from its 4-neighbor
// connection mask. The block covers all 16 masks directly: sub-tile (m % 4, m / 4) relative to
// the block's top-left tile (baseIndex). Returns an absolute row-major index into the tileset.
export function autotileSubIndex(baseIndex: number, cols: number, mask: number): number {
  const baseCol = baseIndex % cols;
  const baseRow = Math.floor(baseIndex / cols);
  const col = baseCol + (mask % 4);
  const row = baseRow + Math.floor(mask / 4);
  return row * cols + col;
}

// Computes the neighbor mask for an autotile cell by looking at the same tile layer's four
// orthogonal neighbors — called at RENDER time (not paint time), which is what makes edges
// restitch automatically whenever any neighbor is painted or erased.
export function autotileMask(cells: Record<string, MapTileValue>, x: number, y: number, autotileId: string): number {
  const same = (cx: number, cy: number) => cells[cellKey(cx, cy)]?.autotileId === autotileId;
  let mask = 0;
  if (same(x, y - 1)) mask |= AUTOTILE_N;
  if (same(x + 1, y)) mask |= AUTOTILE_E;
  if (same(x, y + 1)) mask |= AUTOTILE_S;
  if (same(x - 1, y)) mask |= AUTOTILE_W;
  return mask;
}

// One CSS background crop of a single tile out of a tileset image, scaled so a source tile of
// tileset.tileSize px fills a destination cell of `cellPx` px. Returned as a style object for a
// plain <div> — no <canvas> needed for editor-scale maps, and `imageRendering: pixelated` keeps
// the pixel art crisp at any zoom.
export function tileBackgroundStyle(tileset: Tileset, tileIndex: number, cellPx: number): CSSProperties {
  const col = tileIndex % tileset.cols;
  const row = Math.floor(tileIndex / tileset.cols);
  const scale = cellPx / tileset.tileSize;
  return {
    backgroundImage: `url(${tileset.image})`,
    backgroundPosition: `${-col * tileset.tileSize * scale}px ${-row * tileset.tileSize * scale}px`,
    backgroundSize: `${tileset.cols * tileset.tileSize * scale}px ${tileset.rows * tileset.tileSize * scale}px`,
    imageRendering: "pixelated",
  };
}

export function createImageLayer(): MapImageLayer {
  return { id: nextId("layer"), kind: "image", name: "Картинки", visible: true, locked: false, opacity: 1, images: [] };
}

export const ZONE_TAGS: { tag: string; label: string; color: string }[] = [
  { tag: "trigger", label: "Триггер", color: "#8b7bff" },
  { tag: "battle", label: "Битва", color: "#dc2626" },
  { tag: "music", label: "Смена музыки", color: "#0ea5e9" },
  { tag: "transition", label: "Переход между картами", color: "#f59e0b" },
  { tag: "spawn", label: "Точка спавна", color: "#22c55e" },
  { tag: "note", label: "Заметка дизайнера", color: "#a1a1aa" },
];
