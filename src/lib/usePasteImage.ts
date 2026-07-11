import { useEffect, useRef } from "react";

// Listens for Ctrl/Cmd+V anywhere while the owning component is mounted and,
// if the clipboard contains an image, hands the File to the callback.
// Doesn't require focusing a specific input first — matches how image paste
// works in most editors (Figma, Notion, etc).
//
// Multiple components can have this hook mounted at once (e.g. a location
// card's cover-image paste handler sitting behind an open Map Editor modal).
// A single `window` "paste" listener with several independent handlers would
// fire ALL of them for one paste — pasting an image while the map editor is
// open would incorrectly also set it as the location's cover image. To avoid
// that, every mounted+enabled consumer registers on a shared stack, and only
// the most-recently-mounted one (the topmost, i.e. whatever opened last —
// modals included) actually receives the pasted image.
type PasteConsumer = (file: File) => void;

const stack: PasteConsumer[] = [];
let listenerAttached = false;

function ensureListener() {
  if (listenerAttached) return;
  listenerAttached = true;
  window.addEventListener("paste", (e: ClipboardEvent) => {
    if (stack.length === 0) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          stack[stack.length - 1](file);
        }
        break;
      }
    }
  });
}

export function usePasteImage(onImage: (file: File) => void, enabled = true) {
  const cbRef = useRef(onImage);
  cbRef.current = onImage;

  useEffect(() => {
    if (!enabled) return;
    ensureListener();
    const consumer: PasteConsumer = (file) => cbRef.current(file);
    stack.push(consumer);
    return () => {
      const idx = stack.indexOf(consumer);
      if (idx >= 0) stack.splice(idx, 1);
    };
  }, [enabled]);
}
