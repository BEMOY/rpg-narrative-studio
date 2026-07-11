// Base Object shape — see docs/05_Database.md
export interface BaseObject {
  uuid: string;
  id: string; // readable id, snake_case, immutable
  version: number;
  name: string;
  description: string;
  created: string;
  modified: string;
  tags: string[];
  references: string[];
  notes: string;
  icon: string;
}

// Item — see docs/05_Database.md (Item, Equipment) and docs/12_Editors.md (Item Editor)
export type ItemType = "item" | "equip";
export type EquipSlot = "head" | "body" | "weapon" | "offhand";

export interface ItemStats {
  attack?: number;
  defense?: number;
  magic?: number;
  speed?: number;
  luck?: number;
  crit?: number;
  capacity?: number;
  [key: string]: number | undefined; // open map — unknown keys preserved (Future Extensions rule)
}

export interface ItemObject extends BaseObject {
  category: "item";
  sprite: string; // asset ref (Studio) -> resolved to engineSymbol on export
  overlay?: string; // asset ref, only meaningful when type === "equip"
  type: ItemType;
  slot?: EquipSlot; // only when type === "equip"
  rarityId: string; // reference to a RarityObject id
  quest: boolean;
  value: number;
  stack: number;
  stats: ItemStats;
}

// Rarity — see docs/12_Editors.md (Rarity Editor), docs/13_Asset_System.md (Color Styles)
export type ColorStyleKind = "solid" | "gradient" | "gradient_anim" | "rainbow" | "pulse";

export interface ColorStyle {
  kind: ColorStyleKind;
  c1: string; // hex
  c2?: string; // hex, gradient/pulse only
  speed?: number; // gradient_anim / rainbow / pulse only
}

export interface RarityObject {
  uuid: string;
  id: string;
  name: string; // display name, e.g. "EPIC"
  order: number;
  style: ColorStyle;
  glow?: { r: number; g: number; b: number; a: number; radius: number };
}

export interface Project {
  name: string;
  items: ItemObject[];
  rarities: RarityObject[];
}
