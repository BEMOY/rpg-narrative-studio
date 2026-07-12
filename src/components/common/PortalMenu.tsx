import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Renders its children into document.body with position:fixed, anchored under/near
 * `anchorRef`. This escapes any ancestor stacking context (e.g. TopBar's .glass uses
 * backdrop-filter, which creates a stacking context that traps ordinary z-index children
 * behind later-painted siblings like the Gallery). Every dropdown/popover in the app
 * should use this instead of `absolute` + `z-*` to avoid that class of overlap bug.
 */
export function PortalMenu({
  anchorRef,
  open,
  onClose,
  align = "right",
  gap = 8,
  children,
}: {
  anchorRef: React.RefObject<HTMLElement>;
  open: boolean;
  onClose: () => void;
  align?: "right" | "left";
  gap?: number;
  children: React.ReactNode;
}) {
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    if (align === "right") {
      setPos({ top: rect.bottom + gap, right: window.innerWidth - rect.right });
    } else {
      setPos({ top: rect.bottom + gap, left: rect.left });
    }
  }, [open, anchorRef, align, gap]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current && menuRef.current.contains(target)) return;
      if (anchorRef.current && anchorRef.current.contains(target)) return;
      // A click inside ANOTHER portal menu (e.g. a SearchSelect dropdown opened from within
      // this menu) lands in a separate DOM subtree under document.body — not a descendant of
      // menuRef — so without this check the outer menu would see it as an "outside" click and
      // close itself (and, since it unmounts, the inner menu too) before the inner click's own
      // onChange/pick() handler ever ran. Recognize any `.popover` (every PortalMenu's own
      // wrapper class) as "still inside menu UI" so nested pickers work.
      if (target instanceof Element && target.closest(".popover")) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Only an OUTSIDE scroll (e.g. the page/canvas behind the menu) should close it — a scroll
    // happening INSIDE the menu's own content (a long list like the changelog bell, or a
    // scrollbar drag) used to bubble up to this same capture-phase listener and close the menu
    // out from under the very scroll gesture that was supposed to just scroll it.
    const onScroll = (e: Event) => {
      const target = e.target;
      if (target instanceof Node && menuRef.current?.contains(target)) return;
      onClose();
    };
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, onClose, anchorRef]);

  if (!open || !pos) return null;

  return createPortal(
    <div
      ref={menuRef}
      className="popover rounded-lg fixed"
      style={{ top: pos.top, left: pos.left, right: pos.right, zIndex: 9999 }}
    >
      {children}
    </div>,
    document.body
  );
}
