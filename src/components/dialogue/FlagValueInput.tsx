import type { DialogueFlagType } from "../../types/database";
import { ThemedSelect } from "../common/ThemedSelect";

// A flag's stored value is usually a boolean (matching the user's own GML convention, e.g.
// flag_set("helped_test", true)) or occasionally a number. When the flag's registered type is
// known (see project.dialogueFlagTypes, set in the Flags manager), show the exact right control
// straight away — a simple on/off switch for bool, a plain number field for number — instead of
// making the user pick "true/false/число" from a generic dropdown every time. Falls back to that
// dropdown only when the flag's type isn't known yet (e.g. a brand new, unregistered flag name).
export function FlagValueInput({
  value,
  onChange,
  className = "",
  flagType,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  flagType?: DialogueFlagType;
}) {
  if (flagType === "bool") {
    const on = (value ?? "").trim().toLowerCase() === "true";
    return (
      <button
        type="button"
        onClick={() => onChange(on ? "false" : "true")}
        className={`flex items-center gap-1.5 px-1.5 py-1 rounded-full transition-colors shrink-0 ${className}`}
        title="Переключить true/false"
      >
        <span className={`relative w-8 h-[18px] rounded-full transition-colors ${on ? "bg-accent/80" : "bg-[var(--op-15)]"}`}>
          <span
            className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-all ${on ? "left-[16px]" : "left-[2px]"}`}
          />
        </span>
        <span className={`text-[11px] mono ${on ? "text-accent" : "text-[var(--op-40)]"}`}>{on ? "true" : "false"}</span>
      </button>
    );
  }

  if (flagType === "number") {
    return (
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className={`input text-[11px] py-1 min-w-0 ${className}`}
      />
    );
  }

  // Unknown type — fall back to the old explicit true/false/number picker.
  const trimmed = (value ?? "").trim().toLowerCase();
  const kind = trimmed === "true" ? "true" : trimmed === "false" ? "false" : "number";

  return (
    <div className={`flex items-center gap-1 min-w-0 ${className}`}>
      <ThemedSelect
        value={kind}
        onChange={(k) => {
          if (k === "true") onChange("true");
          else if (k === "false") onChange("false");
          else onChange(kind === "number" ? value : "");
        }}
        options={[
          { value: "true", label: "true" },
          { value: "false", label: "false" },
          { value: "number", label: "число…" },
        ]}
        className="input text-[11px] py-1 w-[74px] shrink-0"
        panelClassName="min-w-[90px]"
      />
      {kind === "number" && (
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0"
          className="input text-[11px] py-1 flex-1 min-w-0"
        />
      )}
    </div>
  );
}
