import { useEffect, useState } from "react";
import { Plus, LogOut, Copy, KeyRound, FolderOpen, Pencil, Trash2, ShieldCheck, ChevronDown, ChevronRight } from "lucide-react";
import { ThemeMenu } from "../components/ThemeMenu";
import { supabase } from "../lib/supabaseClient";
import {
  createInvite,
  createProject,
  deleteProject,
  getMyProfile,
  listAllProjectsForAdmin,
  listMyInvites,
  listProjects,
  renameProject,
  type AdminProjectGroup,
  type InviteRow,
  type ProfileRow,
  type ProjectRow,
} from "../cloud/projects";
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
  const [myProfile, setMyProfile] = useState<ProfileRow | null>(null);
  const [adminGroups, setAdminGroups] = useState<AdminProjectGroup[] | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);

  const refresh = async () => {
    setProjects(await listProjects());
  };

  useEffect(() => {
    refresh();
    supabase.auth.getUser().then(({ data }) => {
      const meta = data.user?.user_metadata as { username?: string } | undefined;
      setUsername(meta?.username ?? data.user?.email?.split("@")[0] ?? "");
    });
    getMyProfile()
      .then(setMyProfile)
      .catch(() => setMyProfile(null));
  }, []);

  const toggleAdmin = async () => {
    setAdminOpen((v) => !v);
    if (!adminGroups) {
      try {
        setAdminGroups(await listAllProjectsForAdmin());
      } catch (e: any) {
        alert(e?.message ?? String(e));
      }
    }
  };

  const newProject = async () => {
    const name = prompt("Название проекта:", "New Project");
    if (!name) return;
    setCreating(true);
    try {
      const row = await createProject(name, { name, entries: [], rarities: DEFAULT_RARITIES, chapters: [] });
      onOpen(row);
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally {
      setCreating(false);
    }
  };

  const rename = async (p: ProjectRow, e: React.MouseEvent) => {
    e.stopPropagation();
    const name = prompt("Новое название проекта:", p.name);
    if (!name || name === p.name) return;
    try {
      await renameProject(p.id, name);
      await refresh();
    } catch (err: any) {
      alert(err?.message ?? String(err));
    }
  };

  const remove = async (p: ProjectRow, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Удалить проект «${p.name}»? Это необратимо.`)) return;
    try {
      await deleteProject(p.id);
      await refresh();
    } catch (err: any) {
      alert(err?.message ?? String(err));
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
          <div className="text-xs text-[var(--op-30)] flex items-center gap-1">
            @{username}
            {myProfile?.is_admin && (
              <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-accent/20 text-accent">
                <ShieldCheck size={10} /> admin
              </span>
            )}
          </div>
          <div className="flex-1" />
          {myProfile?.is_admin && (
            <button onClick={openInvites} className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md glass hover:bg-[var(--op-10)]">
              <KeyRound size={14} /> Пригласить друга
            </button>
          )}
          <button
            onClick={() => supabase.auth.signOut()}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md glass hover:bg-[var(--op-10)]"
          >
            <LogOut size={14} /> Выйти
          </button>
          <ThemeMenu />
        </div>

        {showInvites && (
          <div className="glass rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm text-[var(--op-60)]">Коды приглашений — дайте другу, он вводит его при регистрации.</div>
              <button onClick={genInvite} className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-accent/80 hover:bg-accent">
                <Plus size={12} /> Новый код
              </button>
            </div>
            <div className="space-y-1.5">
              {invites.length === 0 && <div className="text-xs text-[var(--op-30)]">Пока нет кодов.</div>}
              {invites.map((inv) => (
                <div key={inv.code} className="flex items-center gap-2 text-xs mono">
                  <span className={inv.used_by ? "text-[var(--op-30)] line-through" : "text-[var(--op-80)]"}>{inv.code}</span>
                  <span className="text-[var(--op-30)]">{inv.used_by ? "использован" : "свободен"}</span>
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
          {projects === null && <div className="text-[var(--op-30)] text-sm">Загрузка…</div>}
          {projects?.map((p) => (
            <div
              key={p.id}
              onClick={() => onOpen(p)}
              role="button"
              tabIndex={0}
              className="group relative glass rounded-lg p-5 text-left hover:-translate-y-0.5 hover:border-[var(--op-20)] transition-transform cursor-pointer"
            >
              <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => rename(p, e)}
                  className="p-1.5 rounded-md bg-black/40 backdrop-blur-sm text-[var(--op-50)] hover:text-[var(--op-90)] hover:bg-black/60"
                  title="Переименовать"
                >
                  <Pencil size={12} />
                </button>
                <button
                  onClick={(e) => remove(p, e)}
                  className="p-1.5 rounded-md bg-black/40 backdrop-blur-sm text-[var(--op-50)] hover:text-red-300 hover:bg-black/60"
                  title="Удалить"
                >
                  <Trash2 size={12} />
                </button>
              </div>
              <FolderOpen size={20} className="text-accent mb-3" />
              <div className="text-sm font-medium text-[var(--op-90)] truncate pr-10">{p.name}</div>
              <div className="text-xs text-[var(--op-40)] mt-1">{(p.data?.entries?.length ?? 0)} объектов</div>
              <div className="text-[11px] text-[var(--op-25)] mt-2">обновлён {new Date(p.updated_at).toLocaleString()}</div>
            </div>
          ))}
          <button
            onClick={newProject}
            disabled={creating}
            className="rounded-lg border border-dashed border-[var(--op-15)] p-5 flex flex-col items-center justify-center gap-2 text-[var(--op-40)] hover:text-[var(--op-80)] hover:border-[var(--op-30)] transition-colors min-h-[140px]"
          >
            <Plus size={20} />
            <span className="text-sm">{creating ? "Создаю…" : "Новый проект"}</span>
          </button>
        </div>

        {myProfile?.is_admin && (
          <div className="mt-8">
            <button
              onClick={toggleAdmin}
              className="flex items-center gap-2 text-sm text-[var(--op-60)] hover:text-[var(--op-90)] mb-3"
            >
              {adminOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <ShieldCheck size={14} className="text-accent" />
              <span className="font-medium">Все проекты</span>
              <span className="text-xs text-[var(--op-30)]">(админ)</span>
            </button>

            {adminOpen && (
              <div className="space-y-6">
                {adminGroups === null && <div className="text-[var(--op-30)] text-sm">Загрузка…</div>}
                {adminGroups?.length === 0 && (
                  <div className="text-[var(--op-30)] text-sm">Других пользователей пока нет.</div>
                )}
                {adminGroups?.map((g) => (
                  <div key={g.profile.id}>
                    <div className="text-xs uppercase tracking-wider text-[var(--op-40)] mb-2">
                      {g.profile.username ?? g.profile.id.slice(0, 8)}
                      <span className="ml-2 text-[var(--op-25)] normal-case">{g.projects.length} проект(ов)</span>
                    </div>
                    {g.projects.length === 0 ? (
                      <div className="text-xs text-[var(--op-25)] mb-2">Нет проектов.</div>
                    ) : (
                      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
                        {g.projects.map((p) => (
                          <div
                            key={p.id}
                            onClick={() => onOpen(p)}
                            role="button"
                            tabIndex={0}
                            className="group relative glass rounded-lg p-5 text-left hover:-translate-y-0.5 hover:border-[var(--op-20)] transition-transform cursor-pointer"
                          >
                            <FolderOpen size={20} className="text-accent mb-3" />
                            <div className="text-sm font-medium text-[var(--op-90)] truncate">{p.name}</div>
                            <div className="text-xs text-[var(--op-40)] mt-1">{(p.data?.entries?.length ?? 0)} объектов</div>
                            <div className="text-[11px] text-[var(--op-25)] mt-2">обновлён {new Date(p.updated_at).toLocaleString()}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
