import type { EquipSlot, ItemObject, ItemType } from "../../types/database";
import { useProjectStore } from "../../store/useProjectStore";

const SLOTS: EquipSlot[] = ["head", "body", "weapon", "offhand"];
const SUGGESTED_STATS = ["attack", "defense", "magic", "speed", "luck", "crit", "capacity"];

export function ItemEditor({ item }: { item: ItemObject }) {
  const rarities = useProjectStore((s) => s.project.rarities);
  const updateItem = useProjectStore((s) => s.updateItem);
  const updateItemStat = useProjectStore((s) => s.updateItemStat);

  return (
    <div className="max-w-3xl mx-auto p-8 space-y-8">
      <Section title="General">
        <Field label="Readable ID">
          <input className="input mono" value={item.id} disabled />
        </Field>
        <Field label="Name">
          <input className="input" value={item.name} onChange={(e) => updateItem(item.id, { name: e.target.value })} />
        </Field>
        <Field label="Description">
          <textarea
            className="input min-h-[90px]"
            value={item.description}
            onChange={(e) => updateItem(item.id, { description: e.target.value })}
          />
        </Field>
      </Section>

      <Section title="Type">
        <Field label="Type">
          <select
            className="input"
            value={item.type}
            onChange={(e) => updateItem(item.id, { type: e.target.value as ItemType })}
          >
            <option value="item">item</option>
            <option value="equip">equip</option>
          </select>
        </Field>
        {item.type === "equip" && (
          <Field label="Slot">
            <select
              className="input"
              value={item.slot ?? "weapon"}
              onChange={(e) => updateItem(item.id, { slot: e.target.value as EquipSlot })}
            >
              {SLOTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
        )}
      </Section>

      <Section title="Rarity">
        <Field label="Rarity">
          <select className="input" value={item.rarityId} onChange={(e) => updateItem(item.id, { rarityId: e.target.value })}>
            {rarities
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
          </select>
        </Field>
      </Section>

      <Section title="Economy">
        <Field label="Value">
          <input
            type="number"
            className="input"
            value={item.value}
            onChange={(e) => updateItem(item.id, { value: Number(e.target.value) })}
          />
        </Field>
        <Field label="Stack Size">
          <input
            type="number"
            className="input"
            value={item.stack}
            onChange={(e) => updateItem(item.id, { stack: Number(e.target.value) })}
          />
        </Field>
        <Field label="Quest Item">
          <input type="checkbox" checked={item.quest} onChange={(e) => updateItem(item.id, { quest: e.target.checked })} />
        </Field>
      </Section>

      {item.type === "equip" && (
        <Section title="Stats">
          <div className="grid grid-cols-2 gap-3">
            {SUGGESTED_STATS.map((key) => (
              <Field key={key} label={key}>
                <input
                  type="number"
                  className="input"
                  value={item.stats[key] ?? ""}
                  placeholder="—"
                  onChange={(e) => updateItemStat(item.id, key, e.target.value === "" ? undefined : Number(e.target.value))}
                />
              </Field>
            ))}
          </div>
        </Section>
      )}

      <Section title="Visual">
        <Field label="Sprite (engine symbol)">
          <input className="input mono" value={item.sprite} onChange={(e) => updateItem(item.id, { sprite: e.target.value })} />
        </Field>
        {item.type === "equip" && (
          <Field label="Overlay (engine symbol, optional)">
            <input
              className="input mono"
              value={item.overlay ?? ""}
              placeholder="none"
              onChange={(e) => updateItem(item.id, { overlay: e.target.value || undefined })}
            />
          </Field>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass rounded-lg p-5">
      <div className="text-xs uppercase tracking-wider text-white/35 mb-4">{title}</div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[160px_1fr] items-center gap-3">
      <label className="text-sm text-white/50">{label}</label>
      {children}
    </div>
  );
}
