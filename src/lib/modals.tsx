import { useEffect, useState } from "react";

// Themed replacements for window.alert/confirm/prompt — those are OS-native dialogs that
// completely ignore the site's dark theme (on Windows in particular they render with a plain
// white background and black text, unreadable/jarring against everything else), and can't be
// restyled at all since the browser owns their chrome entirely. Same call shape as the native
// versions (just async, since a real in-page modal can't block the JS thread the way the
// native ones do) — call `await themedConfirm(...)`/`await themedPrompt(...)` instead of
// `confirm(...)`/`prompt(...)`, and `themedAlert(...)` instead of `alert(...)`.
//
// Rendered by a single <ModalHost/> mounted once near the app root (see main.tsx) — a tiny
// module-level pub-sub hands the current request to whichever host instance is mounted,
// deliberately NOT going through the project Zustand store since this is ephemeral UI state
// with nothing to do with project data, autosave, or undo/redo history.

type ModalRequest =
  | { kind: "alert"; message: string; resolve: () => void }
  | { kind: "confirm"; message: string; resolve: (v: boolean) => void }
  | { kind: "prompt"; message: string; defaultValue: string; resolve: (v: string | null) => void };

let listeners: Array<(req: ModalRequest | null) => void> = [];

function publish(req: ModalRequest | null) {
  listeners.forEach((l) => l(req));
}

export function themedAlert(message: string): Promise<void> {
  return new Promise((resolve) => {
    publish({ kind: "alert", message, resolve });
  });
}

export function themedConfirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    publish({ kind: "confirm", message, resolve });
  });
}

export function themedPrompt(message: string, defaultValue = ""): Promise<string | null> {
  return new Promise((resolve) => {
    publish({ kind: "prompt", message, defaultValue, resolve });
  });
}

export function ModalHost() {
  const [req, setReq] = useState<ModalRequest | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    listeners.push(setReq);
    return () => {
      listeners = listeners.filter((l) => l !== setReq);
    };
  }, []);

  useEffect(() => {
    if (req?.kind === "prompt") setDraft(req.defaultValue);
  }, [req]);

  if (!req) return null;

  const finish = () => publish(null);

  if (req.kind === "alert") {
    const submit = () => {
      req.resolve();
      finish();
    };
    return (
      <div className="fixed inset-0 z-[200] bg-black/70 grid place-items-center p-4" onMouseDown={submit}>
        <div className="popover rounded-xl w-full max-w-sm overflow-hidden shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
          <div className="px-4 py-3.5 text-sm text-[var(--op-85)] whitespace-pre-wrap leading-relaxed">{req.message}</div>
          <div className="p-3 border-t border-[var(--op-10)] flex justify-end">
            <button autoFocus onClick={submit} className="text-sm px-4 py-1.5 rounded-md bg-accent/80 hover:bg-accent text-white">
              ОК
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (req.kind === "confirm") {
    const cancel = () => {
      req.resolve(false);
      finish();
    };
    const submit = () => {
      req.resolve(true);
      finish();
    };
    return (
      <div className="fixed inset-0 z-[200] bg-black/70 grid place-items-center p-4" onMouseDown={cancel}>
        <div className="popover rounded-xl w-full max-w-sm overflow-hidden shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
          <div className="px-4 py-3.5 text-sm text-[var(--op-85)] whitespace-pre-wrap leading-relaxed">{req.message}</div>
          <div className="p-3 border-t border-[var(--op-10)] flex justify-end gap-2">
            <button onClick={cancel} className="text-sm px-4 py-1.5 rounded-md glass hover:bg-[var(--op-10)]">
              Отмена
            </button>
            <button autoFocus onClick={submit} className="text-sm px-4 py-1.5 rounded-md bg-accent/80 hover:bg-accent text-white">
              ОК
            </button>
          </div>
        </div>
      </div>
    );
  }

  // prompt
  const cancel = () => {
    req.resolve(null);
    finish();
  };
  const submit = () => {
    req.resolve(draft);
    finish();
  };
  return (
    <div className="fixed inset-0 z-[200] bg-black/70 grid place-items-center p-4" onMouseDown={cancel}>
      <div className="popover rounded-xl w-full max-w-sm overflow-hidden shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="px-4 py-3.5 space-y-2">
          <div className="text-sm text-[var(--op-85)] whitespace-pre-wrap leading-relaxed">{req.message}</div>
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") cancel();
            }}
            className="input w-full"
          />
        </div>
        <div className="p-3 border-t border-[var(--op-10)] flex justify-end gap-2">
          <button onClick={cancel} className="text-sm px-4 py-1.5 rounded-md glass hover:bg-[var(--op-10)]">
            Отмена
          </button>
          <button onClick={submit} className="text-sm px-4 py-1.5 rounded-md bg-accent/80 hover:bg-accent text-white">
            ОК
          </button>
        </div>
      </div>
    </div>
  );
}
