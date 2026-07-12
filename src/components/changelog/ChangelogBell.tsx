import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { PortalMenu } from "../common/PortalMenu";
import { CHANGELOG_ENTRIES } from "../../lib/changelog";

// Per-browser "last seen" marker for the changelog — same localStorage-preference pattern as
// theme.ts/useResizablePanel.ts elsewhere in this codebase (this is a pure UI convenience, not
// project content, so it doesn't need to round-trip through Supabase). Stores the id of the
// NEWEST entry the writer has already opened the bell and seen; everything listed before that
// id in CHANGELOG_ENTRIES (which is newest-first) counts as unread.
const SEEN_KEY = "rpg-narrative-studio:changelog-last-seen-id";

function getSeenId(): string | null {
  try {
    return window.localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

function setSeenId(id: string) {
  try {
    window.localStorage.setItem(SEEN_KEY, id);
  } catch {
    // non-critical — badge just won't persist across reloads in this environment
  }
}

function computeUnreadCount(): number {
  const seenId = getSeenId();
  if (!seenId) return CHANGELOG_ENTRIES.length; // never opened before — everything is "new"
  const idx = CHANGELOG_ENTRIES.findIndex((e) => e.id === seenId);
  return idx === -1 ? CHANGELOG_ENTRIES.length : idx;
}

// "Что нового" — bell icon with an unread-count badge (same visual language as the admin
// reports inbox button next to it), opening a dropdown listing the most recent editor updates.
// Opening the menu immediately marks everything currently listed as seen.
export function ChangelogBell() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(computeUnreadCount);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    setUnread(0);
    if (CHANGELOG_ENTRIES.length > 0) setSeenId(CHANGELOG_ENTRIES[0].id);
  }, [open]);

  return (
    <div className="relative shrink-0">
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        title="Что нового"
        className="relative w-8 h-8 grid place-items-center rounded-md hover:bg-[var(--op-10)] text-[var(--op-50)] hover:text-[var(--op-90)] transition-colors"
      >
        <Bell size={15} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-accent text-[10px] font-medium grid place-items-center text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      <PortalMenu anchorRef={btnRef} open={open} onClose={() => setOpen(false)}>
        <div className="w-80 max-h-[70vh] flex flex-col">
          <div className="px-3.5 py-2.5 border-b border-[var(--op-10)] text-sm font-medium text-[var(--op-85)]">Что нового</div>
          <div className="overflow-y-auto py-1.5">
            {CHANGELOG_ENTRIES.map((entry) => (
              <div key={entry.id} className="px-3.5 py-2 hover:bg-[var(--op-5)]">
                <div className="text-[13px] text-[var(--op-85)] font-medium">{entry.title}</div>
                {entry.body && <div className="text-[11px] text-[var(--op-45)] mt-0.5 leading-snug">{entry.body}</div>}
              </div>
            ))}
          </div>
        </div>
      </PortalMenu>
    </div>
  );
}
