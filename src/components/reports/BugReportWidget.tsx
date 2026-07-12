import { useEffect, useRef, useState } from "react";
import { Bug, X, Send } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import {
  createReport,
  getMyOpenReport,
  listReportMessages,
  sendReportMessage,
  type BugReportMessageRow,
  type BugReportRow,
} from "../../cloud/reports";
import { themedAlert } from "../../lib/modals";

const POLL_MS = 8000;

// A small always-present corner button so users can report a problem from anywhere in
// the app (project list or inside a project). Once a thread is open it behaves like a
// tiny support chat: the user's messages and any admin replies, polled periodically
// since we don't have realtime subscriptions wired up.
export function BugReportWidget({ variant = "floating" }: { variant?: "floating" | "inline" }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<BugReportRow | null>(null);
  const [messages, setMessages] = useState<BugReportMessageRow[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMyUserId(data.user?.id ?? null));
  }, []);

  const refresh = async () => {
    try {
      const existing = await getMyOpenReport();
      if (existing) {
        setReport(existing.report);
        setMessages(existing.messages);
      }
    } catch {
      // silent — this is a best-effort background check, not worth alarming the user
    }
  };

  useEffect(() => {
    if (open) refresh();
  }, [open]);

  useEffect(() => {
    if (!open || !report) return;
    pollRef.current = setInterval(async () => {
      try {
        setMessages(await listReportMessages(report.id));
      } catch {
        // ignore transient poll failures
      }
    }, POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [open, report]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, open]);

  const submitFirst = async () => {
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    try {
      const { report: r, messages: m } = await createReport(text);
      setReport(r);
      setMessages(m);
      setDraft("");
    } catch (e: any) {
      themedAlert(e?.message ?? String(e));
    } finally {
      setSending(false);
    }
  };

  const submitMore = async () => {
    const text = draft.trim();
    if (!text || !report) return;
    setSending(true);
    try {
      const msg = await sendReportMessage(report.id, text, false);
      setMessages((m) => [...m, msg]);
      setDraft("");
    } catch (e: any) {
      themedAlert(e?.message ?? String(e));
    } finally {
      setSending(false);
    }
  };

  const submit = () => (report ? submitMore() : submitFirst());

  return (
    <>
      {variant === "floating" ? (
        <button
          onClick={() => setOpen((v) => !v)}
          title="Сообщить об ошибке"
          className="fixed bottom-4 right-4 z-[9990] w-9 h-9 rounded-full grid place-items-center shadow-lg transition-transform hover:scale-105"
          style={{ background: "var(--popover-bg)", border: "1px solid var(--popover-border)", color: "var(--op-60)" }}
        >
          <Bug size={15} />
        </button>
      ) : (
        // Inline variant: sized to match the status bar's other small icons (the
        // "0 ⛔ · 0 ⚠" warning counters) instead of floating as its own big button.
        <button
          onClick={() => setOpen((v) => !v)}
          title="Сообщить об ошибке"
          className="inline-flex items-center opacity-60 hover:opacity-100 hover:text-[var(--op-90)] transition-opacity"
        >
          <Bug size={12} />
        </button>
      )}

      {open && (
        <div
          className="popover fixed bottom-16 right-4 z-[9990] w-80 h-96 rounded-lg flex flex-col overflow-hidden shadow-2xl"
        >
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--op-10)] shrink-0">
            <Bug size={14} className="text-[var(--op-50)]" />
            <span className="text-sm font-medium text-[var(--op-85)]">Сообщить об ошибке</span>
            <button onClick={() => setOpen(false)} className="ml-auto opacity-50 hover:opacity-100">
              <X size={14} />
            </button>
          </div>

          {!report ? (
            <div className="flex-1 flex flex-col p-3 gap-2">
              <div className="text-xs text-[var(--op-40)] leading-relaxed">
                Опишите проблему — админ увидит это сообщение и сможет ответить прямо здесь.
              </div>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Что пошло не так?"
                className="input flex-1 resize-none text-sm"
              />
              <button
                onClick={submitFirst}
                disabled={sending || !draft.trim()}
                className="flex items-center justify-center gap-1.5 text-sm px-3 py-1.5 rounded-md bg-accent/80 hover:bg-accent transition-colors disabled:opacity-40"
              >
                <Send size={13} /> {sending ? "Отправка…" : "Отправить"}
              </button>
            </div>
          ) : (
            <>
              <div ref={listRef} className="flex-1 overflow-y-auto p-3 space-y-2">
                {messages.map((m) => {
                  const mine = m.sender_id === myUserId;
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-xs leading-relaxed ${
                          m.is_admin ? "bg-accent/20 text-[var(--op-85)]" : mine ? "bg-[var(--op-10)] text-[var(--op-85)]" : "bg-[var(--op-7)] text-[var(--op-70)]"
                        }`}
                      >
                        {m.is_admin && <div className="text-[9px] uppercase tracking-wider text-accent mb-0.5">Поддержка</div>}
                        {m.body}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 p-2 border-t border-[var(--op-10)] shrink-0">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submit();
                  }}
                  placeholder="Написать сообщение…"
                  className="input flex-1 text-sm py-1.5"
                />
                <button
                  onClick={submit}
                  disabled={sending || !draft.trim()}
                  className="w-8 h-8 shrink-0 grid place-items-center rounded-md bg-accent/80 hover:bg-accent transition-colors disabled:opacity-40"
                >
                  <Send size={14} />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
