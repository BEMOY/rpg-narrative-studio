// A flag's stored value is usually a boolean (matching the user's own GML convention, e.g.
// flag_set("helped_test", true)) or occasionally a number — this dropdown makes both easy to
// pick correctly instead of free-typing "true"/"false" by hand.
export function FlagValueInput({
  value,
  onChange,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const trimmed = (value ?? "").trim().toLowerCase();
  const kind = trimmed === "true" ? "true" : trimmed === "false" ? "false" : "number";

  return (
    <div className={`flex items-center gap-1 min-w-0 ${className}`}>
      <select
        value={kind}
        onChange={(e) => {
          const k = e.target.value;
          if (k === "true") onChange("true");
          else if (k === "false") onChange("false");
          else onChange(kind === "number" ? value : "");
        }}
        className="input text-[11px] py-1 w-[74px] shrink-0"
      >
        <option value="true">true</option>
        <option value="false">false</option>
        <option value="number">число…</option>
      </select>
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
