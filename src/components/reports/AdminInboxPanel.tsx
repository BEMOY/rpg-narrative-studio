import { useEffect, useState } from "react";
import { X, Send, ShieldCheck, CheckCircle2 } from "lucide-react";
import {
  closeReport,
  listAllReportThreads,
  sendReportMessage,
  type AdminReportThread,
} from "../../cloud/reports";
import { themedAlert } from "../../lib/modals";

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "только что";
  if (mins < 60) return `${mins} мин назад`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  return `${days} дн назад`;
}

// Full-screen-ish modal styled like a support inbox: a list of every user's report
// thread on the left (sorted by most recent activity), the open conversation + a
// reply box on the right. Mirrors the "чат поддержки" the user asked for.
export function AdminInboxPanel({ onClose }: { onClose: () => void }) {
  const [threads, setThreads] = useState<AdminReportThread[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const load = async () => {
    try {
      const t = await listAllReportThreads();
      setThreads(t);
      if (!selectedId && t.length) setSelectedId(t[0].report.id);
    } catch (e: any) {
      themedAlert(e?.message ?? String(e));
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = threads?.find((t) => t.report.id === selectedId) ?? null;

  const sendReply = async () => {
    const text = reply.trim();
    if (!text || !selected) return;
    setSending(true);
    try {
      const msg = await sendReportMessage(selected.report.id, text, true);
      setThreads((prev) =>
        prev
          ? prev.map((t) =>
              t.report.id === selected.report.id
                ? { ...t, messages: [...t.messages, msg], lastMessage: msg, needsReply: false }
                : t
            )
          : prev
      );
      setReply("");
    } catch (e: any) {
      themedAlert(e?.message ?? String(e));
    } finally {
      setSending(false);
    }
  };

  const markResolved = async () => {
    if (!selected) return;
    try {
      await closeReport(selected.report.id);
      setThreads((prev) =>
        prev
          ? prev.map((t) =>
              t.report.id === selected.report.id ? { ...t, report: { ...t.report, status: "closed" }, needsReply: false } : t
            )
          : prev
      );
    } catch (e: any) {
      themedAlert(e?.message ?? String(e));
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3" onClick={onClose}>
      <div
        className="popover rounded-xl w-full max-w-3xl h-[560px] flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--op-10)] shrink-0">
          <ShieldCheck size={15} className="text-accent" />
          <span className="text-sm font-medium text-[var(--op-85)]">Поддержка — репорты пользователей</span>
          <button onClick={onClose} className="ml-auto opacity-50 hover:opacity-100">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className="w-56 border-r border-[var(--op-10)] overflow-y-auto shrink-0">
            {threads === null && <div className="p-4 text-xs text-[var(--op-30)]">Загрузка…</div>}
            {threads?.length === 0 && <div className="p-4 text-xs text-[var(--op-30)]">Пока нет репортов.</div>}
            {threads?.map((t) => (
              <button
                key={t.report.id}
                onClick={() => setSelectedId(t.report.id)}
                className={`w-full text-left px-3 py-2.5 border-b border-[var(--op-7)] transition-colors ${
                  selectedId === t.report.id ? "bg-[var(--op-10)]" : "hover:bg-[var(--op-5)]"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-[var(--op-85)] truncate flex-1">{t.ownerUsername}</span>
                  {t.needsReply && <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />}
                  {t.report.status === "closed" && <CheckCircle2 size={11} className="text-[var(--op-30)] shrink-0" />}
                </div>
                <div className="text-[11px] text-[var(--op-35)] truncate mt-0.5">{t.lastMessage?.body ?? "—"}</div>
                <div className="text-[10px] text-[var(--op-25)] mt-0.5">{timeAgo(t.report.updated_at)}</div>
              </button>
            ))}
          </div>

          <div className="flex-1 flex flex-col overflow-hidden">
            {!selected ? (
              <div className="flex-1 grid place-items-center text-sm text-[var(--op-30)]">Выберите чат слева.</div>
            ) : (
              <>
                <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--op-10)] shrink-0">
                  <span className="text-sm text-[var(--op-80)]">{selected.ownerUsername}</span>
                  {selected.report.status === "open" ? (
                    <button
                      onClick={markResolved}
                      className="ml-auto flex items-center gap-1 text-xs px-2 py-1 rounded-md glass hover:bg-[var(--op-10)]"
                    >
                      <CheckCircle2 size={12} /> Отметить решённым
                    </button>
                  ) : (
                    <span className="ml-auto text-xs text-[var(--op-30)]">Закрыто</span>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {selected.messages.map((m) => (
                    <div key={m.id} className={`flex ${m.is_admin ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[75%] rounded-lg px-3 py-1.5 text-xs leading-relaxed ${
                          m.is_admin ? "bg-accent/20 text-[var(--op-85)]" : "bg-[var(--op-7)] text-[var(--op-75)]"
                        }`}
                      >
                        {m.is_admin && <div className="text-[9px] uppercase tracking-wider text-accent mb-0.5">Вы (поддержка)</div>}
                        {m.body}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 p-2.5 border-t border-[var(--op-10)] shrink-0">
                  <input
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") sendReply();
                    }}
                    placeholder="Ответить пользователю…"
                    className="input flex-1 text-sm py-1.5"
                  />
                  <button
                    onClick={sendReply}
                    disabled={sending || !reply.trim()}
                    className="w-8 h-8 shrink-0 grid place-items-center rounded-md bg-accent/80 hover:bg-accent transition-colors disabled:opacity-40"
                  >
                    <Send size={14} />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
