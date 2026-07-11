import { useEffect, useState } from "react";
import { Plus, LogOut, Copy, KeyRound, FolderOpen } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { createInvite, createProject, listMyInvites, listProjects, type InviteRow, type ProjectRow } from "../cloud/projects";
import type { RarityObject } from "../types/database";

const DEFAULT_RARITIES: RarityObject[] = [
  { uuid: "r-common", id: "common", name: "COMMON", order: 0, style: { kind: "solid", c1: "#c8cdd7" } },
  { uuid: "r-uncommon", id: "uncommon", name: "UNCOMMON", order: 1, style: { kind: "solid", c1: "#78e68c" } },
  { uuid: "r-rare", id: "rare", name: "RARE", order: 2, style: { kind: "solid", c1: "#5fafff" } },
  { uuid: "r-epic", id: "epic", name: "EPIC", order: 3, style: { kind: "gradient", c1: "#be82ff", c2: "#965ae6" } },
  { uuid: "r-legendary", id: "legendary", name: "LEGENDARY", order: 4, style: { kind: "gradient_anim", c1: "#ffd25a", c2: "#ff8c28", speed: 0.004 } },
];

export function ProjectsHome({ onOpen }: { onOpen: (row: ProjectRow) => void }) {
  const [projects, setProjects] = useState<ProjectRow[] | null>(null);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [showInvites, setShowInvites] = useState(false);
  const [creating, setCreating] = useState(false);
  const [username, setUsername] = useState<string>("");

  const refresh = async () => {
    setProjects(await listProjects());
  };

  useEffect(() => {
    refresh();
    supabase.auth.getUser().then(({ data }) => {
      const meta = data.user?.user_metadata as { username?: string } | undefined;
      setUsername(meta?.username ?? data.user?.email?.split("@")[0] ?? "");
    });
  }, []);

  const newProject = async () => {
    const name = prompt("Название проекта:", "New Project");
    if (!name) return;
    setCreating(true);
    try {
      const row = await createProject(name, { name, entries: [], rarities: DEFAULT_RARITIES });
      onOpen(row);
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally {
      setCreating(false);
    }
  };

  const genInvite = async () => {
    try {
      const code = await createInvite();
      setInvites(await listMyInvites());
      navigator.clipboard?.writeText(code).catch(() => {});
      alert(`Код приглашения: ${code}\n\n(скопирован в буфер обмена)`);
    } catch (e: any) {
      alert(e?.message ?? String(e));
    }
  };

  const openInvites = async () => {
    setShowInvites((v) => !v);
    if (!showInvites) setInvites(await listMyInvites());
  };

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="text-xl font-semibold">Ваши проекты</div>
          <div className="text-xs text-white/30">@{username}</div>
          <div className="flex-1" />
          <button onClick={openInvites} className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md glass hover:bg-white/10">
            <KeyRound size={14} /> Пригласить друга
          </button>
          <button
            onClick={() => supabase.auth.signOut()}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md glass hover:bg-white/10"
          >
            <LogOut size={14} /> Выйти
          </button>
        </div>

        {showInvites && (
          <div className="glass rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm text-white/60">Коды приглашений — дайте другу, он вводит его при регистрации.</div>
              <button onClick={genInvite} className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-accent/80 hover:bg-accent">
                <Plus size={12} /> Новый код
              </button>
            </div>
            <div className="space-y-1.5">
              {invites.length === 0 && <div className="text-xs text-white/30">Пока нет кодов.</div>}
              {invites.map((inv) => (
                <div key={inv.code} className="flex items-center gap-2 text-xs mono">
                  <span className={inv.used_by ? "text-white/30 line-through" : "text-white/80"}>{inv.code}</span>
                  <span className="text-white/30">{inv.used_by ? "использован" : "свободен"}</span>
                  {!inv.used_by && (
                    <button onClick={() => navigator.clipboard?.writeText(inv.code)} className="opacity-40 hover:opacity-100">
                      <Copy size={11} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
          {projects === null && <div className="text-white/30 text-sm">Загрузка…</div>}
          {projects?.map((p) => (
            <button key={p.id} onClick={() => onOpen(p)} className="glass rounded-lg p-5 text-left hover:-translate-y-0.5 hover:border-white/20 transition-transform">
              <FolderOpen size={20} className="text-accent mb-3" />
              <div className="text-sm font-medium text-white/90 truncate">{p.name}</div>
              <div className="text-xs text-white/40 mt-1">{(p.data?.entries?.length ?? 0)} объектов</div>
              <div className="text-[11px] text-white/25 mt-2">обновлён {new Date(p.updated_at).toLocaleString()}</div>
            </button>
          ))}
          <button
            onClick={newProject}
            disabled={creating}
            className="rounded-lg border border-dashed border-white/15 p-5 flex flex-col items-center justify-center gap-2 text-white/40 hover:text-white/80 hover:border-white/30 transition-colors min-h-[140px]"
          >
            <Plus size={20} />
            <span className="text-sm">{creating ? "Создаю…" : "Новый проект"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
