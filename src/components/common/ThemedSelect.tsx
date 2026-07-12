import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { PortalMenu } from "./PortalMenu";

export interface ThemedSelectOption {
  value: string;
  label: string;
}

// A drop-in replacement for a raw <select> that renders its OWN dropdown list via PortalMenu
// instead of the browser's native combobox popup — the native popup can't be restyled to match
// the site's dark theme at all (on Windows especially, it renders with a plain white
// background and black text regardless of any CSS on the <select>/<option> elements), which is
// what made every native dropdown across the app hard to read against the rest of the UI. Use
// this for short, fixed option lists (side/type/op pickers and the like); for long searchable
// lists (quests, entries) prefer SearchSelect instead, which already solves the same problem
// with an added search box.
export function ThemedSelect({
  value,
  onChange,
  options,
  className = "",
  panelClassName = "min-w-[140px]",
  placeholder,
  align = "left",
}: {
  value: string;
  onChange: (value: string) => void;
  options: ThemedSelectOption[];
  className?: string;
  panelClassName?: string;
  placeholder?: string;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const selected = options.find((o) => o.value === value);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center justify-between gap-1 text-left ${className}`}
      >
        <span className={`truncate ${selected ? "" : "text-[var(--op-35)]"}`}>{selected ? selected.label : (placeholder ?? "")}</span>
        <ChevronDown size={12} className="text-[var(--op-35)] shrink-0" />
      </button>
      <PortalMenu anchorRef={btnRef} open={open} onClose={() => setOpen(false)} align={align}>
        <div className={`p-1.5 max-h-64 overflow-y-auto space-y-0.5 ${panelClassName}`}>
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              className={`w-full text-left px-2 py-1.5 rounded-md text-[11px] truncate ${
                o.value === value ? "bg-accent/20 text-[var(--op-90)]" : "text-[var(--op-70)] hover:bg-[var(--op-7)]"
              }`}
            >
              {o.label}
            </button>
          ))}
          {options.length === 0 && <div className="text-[10px] text-[var(--op-30)] px-2 py-2 text-center">Нет вариантов</div>}
        </div>
      </PortalMenu>
    </>
  );
}
