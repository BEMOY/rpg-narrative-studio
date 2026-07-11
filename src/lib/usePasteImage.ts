import { useEffect } from "react";

// Listens for Ctrl/Cmd+V anywhere while the owning component is mounted and,
// if the clipboard contains an image, hands the File to the callback.
// Doesn't require focusing a specific input first — matches how image paste
// works in most editors (Figma, Notion, etc).
export function usePasteImage(onImage: (file: File) => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            onImage(file);
          }
          break;
        }
      }
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, [onImage, enabled]);
}
