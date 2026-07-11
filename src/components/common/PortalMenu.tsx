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
      if (menuRef.current && !menuRef.current.contains(e.target as Node) && anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onScroll = () => onClose();
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
