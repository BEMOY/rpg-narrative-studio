import { useEffect, useState } from "react";
import type { Entry } from "../../types/database";
import { EntryDetail } from "./EntryDetail";
import { EntryEditor } from "./EntryEditor";

// Two-mode panel per docs/12_Editors.md: opening an object shows a read-only
// detail view first (matches the user's original Codex tool); "Редактировать"
// switches to the form. Mode resets to view whenever a different entry is opened.
export function EntryPanel({ entry }: { entry: Entry }) {
  const [mode, setMode] = useState<"view" | "edit">("view");

  useEffect(() => {
    setMode("view");
  }, [entry.id]);

  if (mode === "edit") {
    return <EntryEditor entry={entry} onDone={() => setMode("view")} />;
  }
  return <EntryDetail entry={entry} onEdit={() => setMode("edit")} />;
}
