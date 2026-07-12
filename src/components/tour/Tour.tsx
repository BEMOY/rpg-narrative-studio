import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, ArrowRight, ArrowLeft, HelpCircle } from "lucide-react";
import { useProjectStore } from "../../store/useProjectStore";

export interface TourStep {
  target: string; // CSS selector for the element to spotlight, e.g. '[data-tour="quests-list"]'
  title: string;
  body: string;
}

// A full interactive walkthrough for one window — a dark overlay with a rectangular "hole" cut
// around the current step's target element (four bands instead of one big div, so the hole
// itself stays fully interactive/clickable if the writer wants to poke at the real UI while
// reading), plus a tooltip card with Back/Next/Skip. Auto-starts once per tourId (per browser,
// via Project.uiSettings.dismissedTutorials) unless tutorials are disabled in Settings, and can
// always be restarted manually via the small "?" button each window renders next to it.
//
// Rendered through a portal straight onto document.body — same reasoning as PortalMenu/
// EquipmentPresetsModal elsewhere in this app: a `backdrop-filter` ancestor (`.glass`) creates a
// new containing block for `position: fixed` descendants, which would otherwise clip/misplace a
// fixed-position overlay nested deep inside one of these windows.
export function Tour({ tourId, steps }: { tourId: string; steps: TourStep[] }) {
  const uiSettings = useProjectStore((s) => s.project.uiSettings);
  const updateUiSettings = useProjectStore((s) => s.updateUiSettings);
  const enabled = uiSettings?.tutorialsEnabled ?? true;
  const dismissed = uiSettings?.dismissedTutorials ?? [];
  const alreadySeen = dismissed.includes(tourId);

  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  // Auto-start once per tourId, after a short delay so the window's own content has painted
  // and the target selectors actually resolve to something on screen.
  useEffect(() => {
    if (!enabled || alreadySeen) return;
    const t = setTimeout(() => {
      setStepIndex(0);
      setActive(true);
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourId, enabled, alreadySeen]);

  useEffect(() => {
    if (!active) return;
    const measure = () => {
      const el = document.querySelector(steps[stepIndex]?.target ?? "");
      setRect(el ? el.getBoundingClientRect() : null);
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    const raf = requestAnimationFrame(measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      cancelAnimationFrame(raf);
    };
  }, [active, stepIndex, steps]);

  const finish = (markSeen: boolean) => {
    setActive(false);
    if (markSeen && !alreadySeen) {
      updateUiSettings({ dismissedTutorials: [...dismissed, tourId] });
    }
  };

  const restart = () => {
    setStepIndex(0);
    setActive(true);
  };

  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;

  return (
    <>
      <button
        onClick={restart}
        title="Показать обучающий тур ещё раз"
        className="w-7 h-7 grid place-items-center rounded-md glass hover:bg-[var(--op-10)] text-[var(--op-45)] hover:text-accent shrink-0"
      >
        <HelpCircle size={14} />
      </button>

      {active &&
        step &&
        createPortal(
          <div className="fixed inset-0 z-[999]" style={{ pointerEvents: "none" }}>
            {rect ? (
              <>
                <div className="absolute bg-black/70" style={{ left: 0, top: 0, right: 0, height: Math.max(0, rect.top - 6), pointerEvents: "auto" }} />
                <div
                  className="absolute bg-black/70"
                  style={{ left: 0, top: rect.bottom + 6, right: 0, bottom: 0, pointerEvents: "auto" }}
                />
                <div
                  className="absolute bg-black/70"
                  style={{ left: 0, top: rect.top - 6, width: Math.max(0, rect.left - 6), height: rect.height + 12, pointerEvents: "auto" }}
                />
                <div
                  className="absolute bg-black/70"
                  style={{ left: rect.right + 6, top: rect.top - 6, right: 0, height: rect.height + 12, pointerEvents: "auto" }}
                />
                <div
                  className="absolute rounded-md ring-2 ring-accent shadow-[0_0_0_4px_rgba(139,123,255,0.25)] transition-all duration-200"
                  style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12 }}
                />
              </>
            ) : (
              <div className="absolute inset-0 bg-black/70" style={{ pointerEvents: "auto" }} />
            )}

            <div
              className="popover rounded-xl w-80 p-4 shadow-2xl absolute"
              style={{
                pointerEvents: "auto",
                left: clampLeft(rect),
                top: rect ? Math.min(window.innerHeight - 180, rect.bottom + 14) : window.innerHeight / 2 - 80,
              }}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] mono text-[var(--op-35)]">
                  {stepIndex + 1}/{steps.length}
                </span>
                <div className="flex-1" />
                <button onClick={() => finish(true)} className="opacity-40 hover:opacity-100">
                  <X size={13} />
                </button>
              </div>
              <div className="text-sm font-medium text-[var(--op-90)] mb-1.5">{step.title}</div>
              <div className="text-xs text-[var(--op-60)] leading-relaxed mb-3">{step.body}</div>
              <div className="flex items-center gap-2">
                <button onClick={() => finish(false)} className="text-xs text-[var(--op-35)] hover:text-[var(--op-65)]">
                  Пропустить тур
                </button>
                <div className="flex-1" />
                {stepIndex > 0 && (
                  <button
                    onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
                    className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md glass hover:bg-[var(--op-10)]"
                  >
                    <ArrowLeft size={11} /> Назад
                  </button>
                )}
                <button
                  onClick={() => (isLast ? finish(true) : setStepIndex((i) => i + 1))}
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-accent/80 hover:bg-accent"
                >
                  {isLast ? "Готово" : "Далее"} {!isLast && <ArrowRight size={11} />}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

function clampLeft(rect: DOMRect | null): number {
  const width = 320;
  const margin = 12;
  if (!rect) return window.innerWidth / 2 - width / 2;
  return Math.min(window.innerWidth - width - margin, Math.max(margin, rect.left));
}
