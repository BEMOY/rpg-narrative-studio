import { useState } from "react";
import { X, Download, Loader2 } from "lucide-react";

// Accepts either a bare Lospec slug ("greyt-bit") or a full lospec.com palette URL (any of the
// .json/.hex/.csv/plain page variants) and pulls out just the slug Lospec's own API wants.
function extractLospecSlug(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const urlMatch = trimmed.match(/lospec\.com\/palette-list\/([a-z0-9-]+)/i);
  if (urlMatch) return urlMatch[1];
  if (/^[a-z0-9-]+$/i.test(trimmed)) return trimmed;
  return null;
}

// Pulls every 6-digit hex color out of arbitrary pasted text — handles Lospec's own .hex export
// format (one bare code per line, no #), comma/space separated lists, or a CSV export, all with
// the same simple regex instead of needing the user to match a specific format exactly.
function parseHexList(input: string): string[] {
  const matches = input.match(/#?[0-9a-fA-F]{6}\b/g) ?? [];
  return matches.map((h) => (h.startsWith("#") ? h : `#${h}`).toLowerCase());
}

// Two independent ways in: fetch straight from Lospec's public palette API
// (https://lospec.com/palette-list/<slug>.json — documented at lospec.com/palettes/api), or
// paste hex codes in directly. The fetch path needs Lospec's API to allow cross-origin requests
// from wherever this app is hosted (e.g. GitHub Pages); if that fails for any reason (network,
// CORS, a typo'd slug), the paste box below still works as a fallback that never depends on any
// external site cooperating.
export function PaletteImportModal({ onImport, onClose }: { onImport: (colors: string[]) => void; onClose: () => void }) {
  const [slugInput, setSlugInput] = useState("");
  const [pasted, setPasted] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFromLospec = async () => {
    const slug = extractLospecSlug(slugInput);
    if (!slug) {
      setError("Введите название (slug) или ссылку на палитру Lospec.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`https://lospec.com/palette-list/${slug}.json`);
      if (!res.ok) throw new Error("Палитра не найдена — проверьте название.");
      const data = await res.json();
      if (!Array.isArray(data.colors) || data.colors.length === 0) throw new Error("Не удалось прочитать цвета из ответа Lospec.");
      onImport(data.colors.map((c: string) => `#${String(c).replace(/^#/, "")}`));
      onClose();
    } catch (e: any) {
      setError(
        e?.message === "Failed to fetch"
          ? "Не удалось загрузить — сайт мог заблокировать запрос из браузера. Попробуйте вставить hex-цвета вручную ниже."
          : (e?.message ?? "Не удалось загрузить палитру.")
      );
    } finally {
      setLoading(false);
    }
  };

  const importPasted = () => {
    const colors = parseHexList(pasted);
    if (colors.length === 0) {
      setError("Не найдено ни одного hex-цвета (например #a1a1aa) во вставленном тексте.");
      return;
    }
    onImport(colors);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 grid place-items-center p-4" onMouseDown={onClose}>
      <div className="popover rounded-xl w-full max-w-sm overflow-hidden shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--op-10)]">
          <Download size={14} className="text-accent" />
          <span className="text-sm font-medium text-[var(--op-85)]">Импорт палитры</span>
          <button onClick={onClose} className="ml-auto opacity-50 hover:opacity-100">
            <X size={15} />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <div className="text-xs text-[var(--op-45)] mb-1">Из Lospec (название или ссылка)</div>
            <div className="flex gap-1.5">
              <input
                autoFocus
                value={slugInput}
                onChange={(e) => setSlugInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loadFromLospec()}
                placeholder="например: greyt-bit"
                className="input text-xs flex-1"
              />
              <button
                onClick={loadFromLospec}
                disabled={loading}
                className="px-3 rounded-md text-xs bg-accent/80 hover:bg-accent text-white disabled:opacity-50 flex items-center gap-1.5 shrink-0"
              >
                {loading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                Загрузить
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-[var(--op-30)]">
            <div className="flex-1 h-px bg-[var(--op-10)]" />
            или
            <div className="flex-1 h-px bg-[var(--op-10)]" />
          </div>
          <div>
            <div className="text-xs text-[var(--op-45)] mb-1">Вставьте hex-цвета (через запятую, пробел или с новой строки)</div>
            <textarea
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder={"#574368\n#8488d3\n#cfd3c1"}
              rows={3}
              className="input text-xs w-full resize-none"
            />
            <button onClick={importPasted} className="mt-1.5 w-full px-3 py-1.5 rounded-md text-xs glass hover:bg-[var(--op-10)]">
              Добавить из текста
            </button>
          </div>
          {error && <div className="text-[11px] text-red-300 leading-relaxed">{error}</div>}
        </div>
      </div>
    </div>
  );
}
