// Shared category -> icon mapping, extracted out of five separate copy-pasted local consts
// (CommandPalette, Gallery, GraphView, EntryDetail, Explorer) into one place — needed now that
// Scene/Cutscene/Battle are being added as new categories (see types/database.ts) and having
// five places to remember to update in sync was already fragile with the original eight.
import { User, MapPin, Flag, Swords, Shirt, Package, Box, BookOpen, Clapperboard, Camera, Shield } from "lucide-react";
import type { Category } from "../types/database";

export const CAT_ICON: Record<Category, React.ComponentType<any>> = {
  character: User,
  location: MapPin,
  main_quest: Flag,
  side_quest: Swords,
  equipment: Shirt,
  item: Package,
  object: Box,
  lore: BookOpen,
  scene: Clapperboard,
  cutscene: Camera,
  battle: Shield,
};
