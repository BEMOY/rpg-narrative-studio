import { supabase } from "../lib/supabaseClient";

export interface BugReportRow {
  id: string;
  owner_id: string;
  status: "open" | "closed";
  created_at: string;
  updated_at: string;
}

export interface BugReportMessageRow {
  id: string;
  report_id: string;
  sender_id: string;
  is_admin: boolean;
  body: string;
  created_at: string;
}

export interface AdminReportThread {
  report: BugReportRow;
  ownerUsername: string;
  messages: BugReportMessageRow[];
  lastMessage: BugReportMessageRow | null;
  needsReply: boolean; // last message was from the user, not an admin
}

// ---- user side: one open report/thread per user at a time ----

export async function getMyOpenReport(): Promise<{ report: BugReportRow; messages: BugReportMessageRow[] } | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: reports, error } = await supabase
    .from("bug_reports")
    .select("*")
    .eq("owner_id", user.id)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  const report = (reports as BugReportRow[])?.[0];
  if (!report) return null;

  const { data: messages, error: mErr } = await supabase
    .from("bug_report_messages")
    .select("*")
    .eq("report_id", report.id)
    .order("created_at", { ascending: true });
  if (mErr) throw mErr;

  return { report, messages: (messages as BugReportMessageRow[]) ?? [] };
}

export async function createReport(firstMessage: string): Promise<{ report: BugReportRow; messages: BugReportMessageRow[] }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Не авторизован");

  const { data: report, error } = await supabase
    .from("bug_reports")
    .insert({ owner_id: user.id, status: "open" })
    .select()
    .single();
  if (error) throw error;

  const { data: message, error: mErr } = await supabase
    .from("bug_report_messages")
    .insert({ report_id: report.id, sender_id: user.id, is_admin: false, body: firstMessage })
    .select()
    .single();
  if (mErr) throw mErr;

  return { report: report as BugReportRow, messages: [message as BugReportMessageRow] };
}

export async function sendReportMessage(reportId: string, body: string, isAdmin: boolean): Promise<BugReportMessageRow> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Не авторизован");

  const { data, error } = await supabase
    .from("bug_report_messages")
    .insert({ report_id: reportId, sender_id: user.id, is_admin: isAdmin, body })
    .select()
    .single();
  if (error) throw error;
  return data as BugReportMessageRow;
}

export async function listReportMessages(reportId: string): Promise<BugReportMessageRow[]> {
  const { data, error } = await supabase
    .from("bug_report_messages")
    .select("*")
    .eq("report_id", reportId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as BugReportMessageRow[]) ?? [];
}

// ---- admin side: every user's threads, support-inbox style ----

export async function listAllReportThreads(): Promise<AdminReportThread[]> {
  const [{ data: reports, error: rErr }, { data: profiles, error: pErr }] = await Promise.all([
    supabase.from("bug_reports").select("*").order("updated_at", { ascending: false }),
    supabase.from("profiles").select("*"),
  ]);
  if (rErr) throw rErr;
  if (pErr) throw pErr;

  const reportRows = (reports as BugReportRow[]) ?? [];
  const profileById = new Map(((profiles as { id: string; username: string | null }[]) ?? []).map((p) => [p.id, p.username]));

  if (reportRows.length === 0) return [];

  const { data: messages, error: mErr } = await supabase
    .from("bug_report_messages")
    .select("*")
    .in(
      "report_id",
      reportRows.map((r) => r.id)
    )
    .order("created_at", { ascending: true });
  if (mErr) throw mErr;

  const messagesByReport = new Map<string, BugReportMessageRow[]>();
  for (const m of (messages as BugReportMessageRow[]) ?? []) {
    if (!messagesByReport.has(m.report_id)) messagesByReport.set(m.report_id, []);
    messagesByReport.get(m.report_id)!.push(m);
  }

  return reportRows.map((report) => {
    const msgs = messagesByReport.get(report.id) ?? [];
    const lastMessage = msgs.length ? msgs[msgs.length - 1] : null;
    return {
      report,
      ownerUsername: profileById.get(report.owner_id) ?? report.owner_id.slice(0, 8),
      messages: msgs,
      lastMessage,
      needsReply: report.status === "open" && !!lastMessage && !lastMessage.is_admin,
    };
  });
}

export function countNeedsReply(threads: AdminReportThread[]): number {
  return threads.filter((t) => t.needsReply).length;
}

export async function closeReport(reportId: string): Promise<void> {
  const { error } = await supabase.from("bug_reports").update({ status: "closed" }).eq("id", reportId);
  if (error) throw error;
}
