import { useMemo, useState } from "react";
import { X, Copy, Check, Download, TriangleAlert } from "lucide-react";
import type { Dialogue, Entry } from "../../types/database";
import { compileDialogueToGML, compileDialogueToLines, compileSpeakersScript } from "../../lib/dialogueCompile";

type Mode = "register" | "lines" | "speakers";

const MODE_LABEL: Record<Mode, string> = {
  register: "dialogue_register",
  lines: "lines = [...]",
  speakers: "speakers-скрипт",
};

export function GmlExportModal({
  dialogue,
  entries,
  onClose,
}: {
  dialogue: Dialogue;
  entries: Entry[];
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>("register");
  const [copied, setCopied] = useState(false);

  const { code, error } = useMemo(() => {
    try {
      const c =
        mode === "register"
          ? compileDialogueToGML(dialogue, entries)
          : mode === "lines"
          ? compileDialogueToLines(dialogue, entries)
          : compileSpeakersScript(entries);
      return { code: c, error: null as string | null };
    } catch (e: any) {
      return { code: "", error: e?.message ?? String(e) };
    }
  }, [mode, dialogue, entries]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — user can still select-all manually */
    }
  };

  const fileBase = mode === "speakers" ? "speakers_init" : dialogue.name.replace(/[^\w\-а-яА-Я ]/g, "_");
  const download = () => {
    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileBase}.gml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 grid place-items-center p-4" onMouseDown={onClose}>
      <div
        className="glass w-full max-w-3xl max-h-[85vh] rounded-xl flex flex-col overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--op-10)] shrink-0">
          <div className="text-sm font-medium text-[var(--op-85)]">Экспорт в GML — «{dialogue.name}»</div>
          <div className="flex-1" />
          {!error && (
            <button
              onClick={copy}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-accent/80 hover:bg-accent"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Скопировано" : "Копировать"}
            </button>
          )}
          {!error && (
            <button
              onClick={download}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md glass hover:bg-[var(--op-10)]"
            >
              <Download size={13} /> .gml
            </button>
          )}
          <button onClick={onClose} className="w-8 h-8 grid place-items-center rounded-md glass hover:bg-[var(--op-10)]">
            <X size={14} />
          </button>
        </div>

        <div className="flex items-center gap-1 px-4 pt-3 shrink-0">
          {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
                mode === m ? "bg-accent/25 text-[var(--op-95)]" : "bg-[var(--op-6)] text-[var(--op-45)] hover:bg-[var(--op-10)]"
              }`}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>

        {error ? (
          <div className="p-4 flex items-start gap-2 text-xs text-red-400">
            <TriangleAlert size={15} className="shrink-0 mt-0.5" />
            <div>{error}</div>
          </div>
        ) : (
          <>
            <div className="px-4 pt-2.5 pb-1 shrink-0 flex items-start gap-2 text-[11px] text-[var(--op-45)]">
              <TriangleAlert size={13} className="shrink-0 mt-0.5" />
              <div>
                {mode === "speakers"
                  ? "Плейсхолдеры для пустых полей — замените спрайты/звуки на свои GameMaker-ассеты."
                  : "Проверьте вручную: ключи спикеров должны совпадать с вашим speaker_define(), а id квестов/объектов — с тем, что принимают ваши quest_status()/item_has()."}
              </div>
            </div>
            <textarea
              readOnly
              value={code}
              className="flex-1 m-4 mt-1 p-3 rounded-md bg-black/40 border border-[var(--op-10)] text-[11px] mono text-[var(--op-80)] resize-none outline-none"
              onFocus={(e) => e.currentTarget.select()}
            />
          </>
        )}
      </div>
    </div>
  );
}
