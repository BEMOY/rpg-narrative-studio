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
  const { data, error } = await supabase.from("projects").select("*").order("updated_at", { ascending: false });
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

// Invites — see migration invite_gated_auth. Any signed-in user may mint codes for friends.
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
