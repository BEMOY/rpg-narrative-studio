import { useMemo, useRef, useState } from "react";
import { X, Copy, Check, Download, TriangleAlert } from "lucide-react";
import type { Dialogue, DialogueColorStyle, Entry } from "../../types/database";
import { compileDialogueToGML, compileDialogueToLines, compileSpeakersScript, compileColorStylesScript } from "../../lib/dialogueCompile";

type Mode = "register" | "lines" | "speakers" | "colors";

const MODE_LABEL: Record<Mode, string> = {
  register: "dialogue_register",
  lines: "lines = [...]",
  speakers: "speakers-скрипт",
  colors: "colors-скрипт",
};

export function GmlExportModal({
  dialogue,
  entries,
  colorStyles,
  onClose,
}: {
  dialogue: Dialogue;
  entries: Entry[];
  colorStyles: DialogueColorStyle[];
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>("register");
  const [copied, setCopied] = useState(false);
  const [size, setSize] = useState(() => ({
    w: Math.min(1080, window.innerWidth - 80),
    h: Math.min(760, window.innerHeight - 80),
  }));
  const resizeRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { startX: e.clientX, startY: e.clientY, startW: size.w, startH: size.h };
    const onMove = (ev: MouseEvent) => {
      const r = resizeRef.current;
      if (!r) return;
      setSize({
        w: Math.max(520, Math.min(window.innerWidth - 40, r.startW + (ev.clientX - r.startX))),
        h: Math.max(360, Math.min(window.innerHeight - 40, r.startH + (ev.clientY - r.startY))),
      });
    };
    const onUp = () => {
      resizeRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const { code, error } = useMemo(() => {
    try {
      const c =
        mode === "register"
          ? compileDialogueToGML(dialogue, entries)
          : mode === "lines"
          ? compileDialogueToLines(dialogue, entries)
          : mode === "speakers"
          ? compileSpeakersScript(entries)
          : compileColorStylesScript(colorStyles);
      return { code: c, error: null as string | null };
    } catch (e: any) {
      return { code: "", error: e?.message ?? String(e) };
    }
  }, [mode, dialogue, entries, colorStyles]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — user can still select-all manually */
    }
  };

  const fileBase =
    mode === "speakers" ? "speakers_init" : mode === "colors" ? "colors_init" : dialogue.name.replace(/[^\w\-а-яА-Я ]/g, "_");
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
        className="glass rounded-xl flex flex-col overflow-hidden relative"
        style={{ width: size.w, height: size.h, maxWidth: "calc(100vw - 40px)", maxHeight: "calc(100vh - 40px)" }}
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
                  : mode === "colors"
                  ? "Цвета экспортируются через make_colour_rgb(...) — точное совпадение с любым hex, никаких догадок."
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

        <div
          onMouseDown={startResize}
          title="Потяните, чтобы изменить размер"
          className="absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize flex items-end justify-end p-1 opacity-40 hover:opacity-90 transition-opacity"
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M9 1 L1 9 M9 5 L5 9 M9 9 L9 9" stroke="var(--op-60)" strokeWidth="1.3" />
          </svg>
        </div>
      </div>
    </div>
  );
}
