// Shared between the equipment editor (icon-button slot picker) and the read-only entry
// detail view (slot display) so both stay in sync — see EntryEditor.tsx / EntryDetail.tsx.
import { Sword, Shield, HardHat, Gem, type LucideIcon } from "lucide-react";
import type { EquipSlot } from "../types/database";

export const SLOTS: EquipSlot[] = ["weapon", "body", "head", "offhand"];

export const SLOT_LABEL: Record<EquipSlot, string> = {
  weapon: "Оружие",
  body: "Броня",
  head: "Шлем",
  offhand: "Аксессуар",
};

export const SLOT_ICON: Record<EquipSlot, LucideIcon> = {
  weapon: Sword,
  body: Shield,
  head: HardHat,
  offhand: Gem,
};
