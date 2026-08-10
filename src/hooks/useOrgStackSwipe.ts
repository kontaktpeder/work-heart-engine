import { useCallback, useEffect, useRef } from "react";

const PAN_ACTIVATE_PX = 12;
const AXIS_LOCK_RATIO = 1.15;
const STACK_COMMIT_PX = 64;
const STACK_COMMIT_VELOCITY = 420;

type Mode = "pending" | "stack" | "blocked";

/**
 * Vertical swipe (Dagenvår-style) to switch org stack.
 * Attaches pointer listeners to `ref`; call onSwipe(1) next / (-1) previous.
 */
export function useOrgStackSwipe(opts: {
  enabled: boolean;
  onSwipe: (direction: 1 | -1) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const onSwipeRef = useRef(opts.onSwipe);
  onSwipeRef.current = opts.onSwipe;
  const enabledRef = useRef(opts.enabled);
  enabledRef.current = opts.enabled;

  const stateRef = useRef({
    mode: "pending" as Mode,
    startX: 0,
    startY: 0,
    lastY: 0,
    lastT: 0,
    vy: 0,
    pointerId: null as number | null,
  });

  const reset = useCallback(() => {
    stateRef.current.mode = "pending";
    stateRef.current.pointerId = null;
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onDown = (e: PointerEvent) => {
      if (!enabledRef.current) return;
      if (e.button !== 0 && e.pointerType === "mouse") return;
      // Don't steal from interactive controls
      const t = e.target as HTMLElement | null;
      if (t?.closest("button, a, input, textarea, select, [role='button']")) return;

      stateRef.current = {
        mode: "pending",
        startX: e.clientX,
        startY: e.clientY,
        lastY: e.clientY,
        lastT: e.timeStamp,
        vy: 0,
        pointerId: e.pointerId,
      };
    };

    const onMove = (e: PointerEvent) => {
      const s = stateRef.current;
      if (s.pointerId !== e.pointerId) return;
      if (!enabledRef.current) return;

      const dx = e.clientX - s.startX;
      const dy = e.clientY - s.startY;
      const adx = Math.abs(dx);
      const ady = Math.abs(dy);
      const dt = Math.max(1, e.timeStamp - s.lastT);
      s.vy = ((e.clientY - s.lastY) / dt) * 1000;
      s.lastY = e.clientY;
      s.lastT = e.timeStamp;

      if (s.mode === "pending") {
        if (ady < PAN_ACTIVATE_PX && adx < PAN_ACTIVATE_PX) return;
        // Vertical wins → org stack
        if (ady >= PAN_ACTIVATE_PX && ady > adx * AXIS_LOCK_RATIO) {
          // If inside a nested scroller, only allow when pulling past edge
          const scrollParent = (e.target as HTMLElement | null)?.closest(
            "[data-org-stack-scroll]",
          ) as HTMLElement | null;
          if (scrollParent) {
            const atTop = scrollParent.scrollTop <= 0;
            const atBottom =
              scrollParent.scrollTop + scrollParent.clientHeight >=
              scrollParent.scrollHeight - 1;
            const pullingDown = dy > 0;
            const pullingUp = dy < 0;
            if ((pullingDown && !atTop) || (pullingUp && !atBottom)) {
              s.mode = "blocked";
              return;
            }
          }
          s.mode = "stack";
          try {
            el.setPointerCapture(e.pointerId);
          } catch {
            /* ignore */
          }
        } else if (adx >= PAN_ACTIVATE_PX) {
          s.mode = "blocked";
        }
        return;
      }

      if (s.mode === "stack") {
        e.preventDefault();
      }
    };

    const onUp = (e: PointerEvent) => {
      const s = stateRef.current;
      if (s.pointerId !== e.pointerId) return;
      const wasStack = s.mode === "stack";
      const dy = e.clientY - s.startY;
      const vy = s.vy;
      reset();
      try {
        if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (!wasStack || !enabledRef.current) return;

      const flicked = Math.abs(vy) > STACK_COMMIT_VELOCITY;
      const dragged = Math.abs(dy) > STACK_COMMIT_PX;
      if (!flicked && !dragged) return;
      // Finger up → next org (like Dagenvår stack)
      if (dy < 0 || (flicked && vy < 0)) onSwipeRef.current(1);
      else onSwipeRef.current(-1);
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove, { passive: false });
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
    // Re-bind if the host node is replaced (e.g. parent remount).
  }, [reset, opts.enabled]);

  return ref;
}
