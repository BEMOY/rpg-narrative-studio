import { supabase } from "../lib/supabaseClient";
import type { Project } from "../types/database";

export interface ProjectRow {
  id: string;
  owner_id: string;
  name: string;
  data: Project;
  created_at: string;
  updated_at: string;
}

export async function listProjects(): Promise<ProjectRow[]> {
  // Explicitly scoped to the caller's own projects. This matters now that admins can also SELECT
  // every project via RLS (projects_admin_select) — without this filter, an admin's "Ваши проекты"
  // grid would silently include everyone else's projects too.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("owner_id", user.id)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data as ProjectRow[];
}

export async function createProject(name: string, initial: Project): Promise<ProjectRow> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");
  const { data, error } = await supabase
    .from("projects")
    .insert({ owner_id: user.id, name, data: initial })
    .select("*")
    .single();
  if (error) throw error;
  return data as ProjectRow;
}

export async function saveProjectData(id: string, data: Project): Promise<void> {
  const { error } = await supabase.from("projects").update({ data, name: data.name }).eq("id", id);
  if (error) throw error;
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw error;
}

export async function renameProject(id: string, name: string): Promise<void> {
  const { error } = await supabase.from("projects").update({ name }).eq("id", id);
  if (error) throw error;
}

// Invites — see migration admin_profiles_system. Only admins may mint codes for friends now.
export async function createInvite(): Promise<string> {
  const code = Array.from({ length: 10 }, () => "abcdefghjkmnpqrstuvwxyz23456789"[Math.floor(Math.random() * 32)]).join("");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");
  const { error } = await supabase.from("invites").insert({ code, created_by: user.id });
  if (error) throw error;
  return code;
}

export interface InviteRow {
  code: string;
  used_by: string | null;
  used_at: string | null;
  created_at: string;
}

export async function listMyInvites(): Promise<InviteRow[]> {
  const { data, error } = await supabase.from("invites").select("code, used_by, used_at, created_at").order("created_at", { ascending: false });
  if (error) throw error;
  return data as InviteRow[];
}

// --- Admin — see migration admin_profiles_system ---

export interface ProfileRow {
  id: string;
  username: string | null;
  is_admin: boolean;
}

export async function getMyProfile(): Promise<ProfileRow | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (error) throw error;
  return (data as ProfileRow | null) ?? null;
}

export interface AdminProjectGroup {
  profile: ProfileRow;
  projects: ProjectRow[];
}

// Admin RLS (projects_admin_select) lets this query return every user's projects, not just the
// caller's own — grouped here by owner so the UI can show "other people's projects" separately
// from "Ваши проекты" (which stays strictly scoped via listProjects() above).
export async function listAllProjectsForAdmin(): Promise<AdminProjectGroup[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const [{ data: projects, error: pErr }, { data: profiles, error: prErr }] = await Promise.all([
    supabase.from("projects").select("*").order("updated_at", { ascending: false }),
    supabase.from("profiles").select("*"),
  ]);
  if (pErr) throw pErr;
  if (prErr) throw prErr;

  const profileById = new Map(((profiles as ProfileRow[]) ?? []).map((p) => [p.id, p]));
  const byOwner = new Map<string, ProjectRow[]>();
  for (const p of (projects as ProjectRow[]) ?? []) {
    if (p.owner_id === user.id) continue; // "Ваши проекты" already covers these
    if (!byOwner.has(p.owner_id)) byOwner.set(p.owner_id, []);
    byOwner.get(p.owner_id)!.push(p);
  }

  return Array.from(byOwner.entries()).map(([ownerId, projs]) => ({
    profile: profileById.get(ownerId) ?? { id: ownerId, username: null, is_admin: false },
    projects: projs,
  }));
}
