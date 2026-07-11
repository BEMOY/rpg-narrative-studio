import { useEffect, useRef, useState } from "react";

interface Options {
  key: string;
  defaultWidth: number;
  min: number;
  max: number;
  side: "left" | "right"; // which edge of the screen/container this panel is anchored to
}

function readNumber(storageKey: string, fallback: number, min: number, max: number): number {
  if (typeof window === "undefined") return fallback;
  const raw = Number(window.localStorage.getItem(storageKey));
  return raw && raw >= min && raw <= max ? raw : fallback;
}

// Shared drag-to-resize + collapse/expand behavior for side panels (Sidebar, Inspector, the
// Map Editor's left/right rails, etc). Width and collapsed state persist per panelKey so the
// layout is remembered between sessions, same as everything else in the Studio.
export function useResizablePanel({ key, defaultWidth, min, max, side }: Options) {
  const widthKey = `rpg-studio-panel-width:${key}`;
  const collapsedKey = `rpg-studio-panel-collapsed:${key}`;

  const [width, setWidthState] = useState<number>(() => readNumber(widthKey, defaultWidth, min, max));
  const [collapsed, setCollapsedState] = useState<boolean>(
    () => typeof window !== "undefined" && window.localStorage.getItem(collapsedKey) === "1"
  );
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const setWidth = (w: number) => {
    const clamped = Math.min(max, Math.max(min, w));
    setWidthState(clamped);
    window.localStorage.setItem(widthKey, String(clamped));
  };
  const setCollapsed = (v: boolean) => {
    setCollapsedState(v);
    window.localStorage.setItem(collapsedKey, v ? "1" : "0");
  };

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startWidth: width };
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const rawDelta = e.clientX - dragRef.current.startX;
      const signedDelta = side === "left" ? rawDelta : -rawDelta;
      setWidth(dragRef.current.startWidth + signedDelta);
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side]);

  return { width, collapsed, setCollapsed, startResize };
}
