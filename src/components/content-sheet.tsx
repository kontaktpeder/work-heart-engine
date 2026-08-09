import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import { useKeyboardInset } from "@/hooks/useKeyboardInset";
import { lockSheetDismiss, unlockSheetDismiss } from "@/lib/sheetGate";
import {
  getNestDepth,
  getNestIndex,
  nestPop,
  nestPush,
  subscribeNest,
} from "@/lib/sheetNest";
import { blurSheetField } from "@/lib/focusSheetField";
import {
  BODY_ACTIVATE_PX,
  COMMIT_PROJECT_SEC,
  DETENT_SPRING,
  DISMISS_VEL,
  NEST_RECESS_EASE,
  NEST_RECESS_MS,
  NEST_RECESS_SCALE,
  NEST_RECESS_Y_PX,
  NUDGE_DEADZONE_PX,
  NUDGE_VEL,
  SAME_DETENT_VEL_CAP,
  SETTLE_SPRING,
  VEL_EMA,
  runSheetEaseOut,
  runSheetSpring,
  type SheetSpringOpts,
} from "@/lib/sheetMotion";

export type SheetDetent = "half" | "full";

const KEYBOARD_SCROLL_FOOTER_RESERVE = 128;

type Props = {
  onClose: () => void;
  children: ReactNode;
  title?: string;
  className?: string;
  zClassName?: string;
  /** Snap points. Default `['full']`. Use `['half','full']` for browse sheets. */
  detents?: SheetDetent[];
  initialDetent?: SheetDetent;
  nest?: boolean;
};

function getScrollEl(root: HTMLElement | null): HTMLElement | null {
  if (!root) return null;
  const marked = root.querySelector("[data-sheet-scroll]") as HTMLElement | null;
  if (marked) return marked;
  return root.querySelector(".overflow-y-auto, .overflow-y-scroll") as HTMLElement | null;
}

function yForDetent(detent: SheetDetent, frameH: number): number {
  const visible = detent === "half" ? 0.55 : 1;
  return Math.max(0, Math.round(frameH * (1 - visible)));
}

function normalizeDetents(detents: SheetDetent[]): SheetDetent[] {
  const set = new Set(detents);
  const ordered: SheetDetent[] = [];
  if (set.has("full")) ordered.push("full");
  if (set.has("half")) ordered.push("half");
  return ordered.length ? ordered : ["full"];
}

function writeSheetY(el: HTMLElement | null, y: number) {
  if (!el) return;
  el.style.transform = `translate3d(0, ${y}px, 0)`;
}

function rubber(overshoot: number, dimension = 200, constant = 0.55): number {
  const sign = Math.sign(overshoot);
  const x = Math.abs(overshoot);
  return sign * ((x * dimension * constant) / (dimension + constant * x));
}

function resistDragY(raw: number, frameH: number): number {
  if (raw < 0) return rubber(raw);
  if (raw > frameH) return frameH + rubber(raw - frameH, 160, 0.4);
  return raw;
}

type GestureState = {
  pointerId: number;
  startY: number;
  lastY: number;
  lastAt: number;
  startDragY: number;
  velocityY: number;
  dragging: boolean;
  fromGrabber: boolean;
  scrollEl: HTMLElement | null;
};

/**
 * Soft bottom sheet — finger follows + spring settle, drag from grabber and content.
 */
export function ContentSheet({
  onClose,
  children,
  title,
  className,
  zClassName = "z-50",
  detents: detentsProp,
  initialDetent,
  nest: nestProp = true,
}: Props) {
  const keyboardInset = useKeyboardInset();
  const keyboardOpen = keyboardInset > 24;
  const nestEnabled = nestProp;
  const cardRef = useRef<HTMLDivElement>(null);
  const sheetLayerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<GestureState | null>(null);
  const detentRef = useRef<SheetDetent>("full");
  const canDragRef = useRef(true);
  const frameHRef = useRef(700);
  const multiDetentRef = useRef(false);
  const nestIdRef = useRef<number | null>(null);
  const yRef = useRef(typeof window !== "undefined" ? window.innerHeight : 640);
  const settleDragRef = useRef<(vy: number) => void>(() => {});
  const cancelSpringRef = useRef<(() => void) | null>(null);
  const animatingRef = useRef(false);

  const nestDepth = useSyncExternalStore(subscribeNest, getNestDepth, () => 0);

  const detents = normalizeDetents(detentsProp ?? ["full"]);
  const multiDetent = detents.length > 1;
  const startDetent: SheetDetent =
    initialDetent && detents.includes(initialDetent)
      ? initialDetent
      : detents.includes("half") && multiDetent
        ? "half"
        : "full";

  const [frameH, setFrameH] = useState(() =>
    typeof window !== "undefined" ? window.innerHeight : 700,
  );

  const maxDim = multiDetent ? 0.28 : 0.4;
  const [backdropOpen, setBackdropOpen] = useState(false);
  const [flyingOut, setFlyingOut] = useState(false);
  const flyingOutRef = useRef(false);
  const enteredRef = useRef(false);
  const dismissLockedRef = useRef(false);

  useLayoutEffect(() => {
    if (!nestEnabled) return;
    nestIdRef.current = nestPush();
    return () => {
      if (nestIdRef.current != null) {
        nestPop(nestIdRef.current);
        nestIdRef.current = null;
      }
    };
  }, [nestEnabled]);

  const releaseNest = () => {
    if (nestIdRef.current != null) {
      nestPop(nestIdRef.current);
      nestIdRef.current = null;
    }
  };

  const myNestIndex =
    nestIdRef.current != null ? getNestIndex(nestIdRef.current) : -1;
  const isRecessed =
    nestEnabled && myNestIndex >= 0 && nestDepth > myNestIndex + 1;

  const canDrag = !flyingOut && !isRecessed;
  canDragRef.current = canDrag;
  flyingOutRef.current = flyingOut;
  frameHRef.current = frameH;
  multiDetentRef.current = multiDetent;

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const id = window.requestAnimationFrame(() => setBackdropOpen(true));
    return () => {
      document.body.style.overflow = previous;
      window.cancelAnimationFrame(id);
    };
  }, []);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => setFrameH(el.clientHeight || window.innerHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      cancelSpringRef.current?.();
      if (dismissLockedRef.current) {
        dismissLockedRef.current = false;
        unlockSheetDismiss();
      }
    };
  }, []);

  const setDragVisual = (on: boolean) => {
    const layer = sheetLayerRef.current;
    const card = cardRef.current;
    if (layer) layer.style.willChange = on ? "transform" : "";
    if (card) card.style.boxShadow = on ? "none" : "";
  };

  const setY = (y: number) => {
    yRef.current = y;
    writeSheetY(sheetLayerRef.current, y);
  };

  const stopSpring = () => {
    cancelSpringRef.current?.();
    cancelSpringRef.current = null;
    animatingRef.current = false;
  };

  const animateTo = (
    target: number,
    opts?: {
      velocity?: number;
      spring?: SheetSpringOpts;
      keepCompositor?: boolean;
      mode?: "spring" | "easeOut";
      onComplete?: () => void;
    },
  ) => {
    stopSpring();
    const keepCompositor = opts?.keepCompositor ?? false;
    if (keepCompositor) setDragVisual(true);
    animatingRef.current = true;

    const finish = () => {
      cancelSpringRef.current = null;
      animatingRef.current = false;
      setY(target);
      if (keepCompositor) setDragVisual(false);
      opts?.onComplete?.();
    };

    if (opts?.mode === "easeOut") {
      cancelSpringRef.current = runSheetEaseOut({
        from: yRef.current,
        to: target,
        onUpdate: setY,
        onComplete: finish,
      });
      return;
    }

    cancelSpringRef.current = runSheetSpring({
      from: yRef.current,
      to: target,
      velocity: opts?.velocity ?? 0,
      spring: opts?.spring ?? DETENT_SPRING,
      onUpdate: setY,
      onComplete: finish,
    });
  };

  const snapTo = (
    detent: SheetDetent,
    opts?: { velocity?: number; spring?: SheetSpringOpts; keepCompositor?: boolean },
  ) => {
    detentRef.current = detent;
    const target = yForDetent(detent, frameHRef.current);
    animateTo(target, {
      velocity: opts?.velocity ?? 0,
      spring: opts?.spring ?? DETENT_SPRING,
      keepCompositor: opts?.keepCompositor ?? false,
    });
  };

  useEffect(() => {
    if (flyingOut || frameH <= 0) return;
    if (!enteredRef.current) {
      enteredRef.current = true;
      detentRef.current = startDetent;
      animateTo(yForDetent(startDetent, frameH), {
        spring: SETTLE_SPRING,
        keepCompositor: true,
      });
      return;
    }
    if (gestureRef.current?.dragging || animatingRef.current) return;
    const target = yForDetent(detentRef.current, frameH);
    if (Math.abs(yRef.current - target) < 6) return;
    animateTo(target, { spring: SETTLE_SPRING });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameH, flyingOut]);

  useEffect(() => {
    if (flyingOut || !enteredRef.current) return;
    if (!keyboardOpen) return;
    if (detentRef.current === "full") return;
    snapTo("full", { spring: SETTLE_SPRING, keepCompositor: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyboardOpen, flyingOut]);

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const pad = keyboardOpen
      ? `${Math.min(keyboardInset, Math.round(window.innerHeight * 0.5)) + KEYBOARD_SCROLL_FOOTER_RESERVE}px`
      : "";
    card.querySelectorAll<HTMLElement>("[data-sheet-scroll]").forEach((el) => {
      el.style.paddingBottom = pad;
    });
  }, [keyboardOpen, keyboardInset]);

  const flyOutThenDismiss = () => {
    if (flyingOutRef.current) return;
    flyingOutRef.current = true;
    setFlyingOut(true);
    setBackdropOpen(false);
    gestureRef.current = null;
    releaseNest();
    if (!dismissLockedRef.current) {
      dismissLockedRef.current = true;
      lockSheetDismiss();
    }
    const curY = yRef.current;
    const travel = Math.max(frameH * 1.05 - curY, frameH * 0.55);
    animateTo(curY + travel, {
      mode: "easeOut",
      keepCompositor: true,
      onComplete: () => {
        if (dismissLockedRef.current) {
          dismissLockedRef.current = false;
          unlockSheetDismiss();
        }
        onClose();
      },
    });
  };

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !flyingOutRef.current) {
        event.preventDefault();
        flyOutThenDismiss();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const settleDrag = (vy: number) => {
    if (flyingOut) return;
    const y = yRef.current;
    const h = frameHRef.current;
    const current = detentRef.current;
    const currentY = yForDetent(current, h);
    const deltaFromCurrent = y - currentY;

    const positions = detents
      .map((d) => ({ d, y: yForDetent(d, h) }))
      .sort((a, b) => a.y - b.y);

    const peekY = positions[positions.length - 1]?.y ?? 0;
    const dismissLine = peekY + Math.max(100, (h - peekY) * 0.35);

    if (y >= dismissLine || (vy >= DISMISS_VEL && y > peekY * 0.35)) {
      flyOutThenDismiss();
      return;
    }

    if (Math.abs(deltaFromCurrent) < NUDGE_DEADZONE_PX && Math.abs(vy) < NUDGE_VEL) {
      snapTo(current, {
        velocity: 0,
        spring: SETTLE_SPRING,
        keepCompositor: true,
      });
      return;
    }

    const projected = y + vy * COMMIT_PROJECT_SEC;
    let best = positions[0]!;
    let bestDist = Math.abs(projected - best.y);
    for (const p of positions) {
      const dist = Math.abs(projected - p.y);
      if (dist < bestDist) {
        best = p;
        bestDist = dist;
      }
    }

    const returningHome = best.d === current;
    const settleVy = returningHome
      ? Math.max(-SAME_DETENT_VEL_CAP, Math.min(SAME_DETENT_VEL_CAP, vy * 0.35))
      : vy;

    snapTo(best.d, {
      velocity: settleVy,
      spring: returningHome ? SETTLE_SPRING : DETENT_SPRING,
      keepCompositor: true,
    });
  };
  settleDragRef.current = settleDrag;

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    const beginDrag = (state: GestureState, clientY: number, timeStamp: number) => {
      blurSheetField();
      state.dragging = true;
      state.startY = clientY;
      state.lastY = clientY;
      state.lastAt = timeStamp;
      state.startDragY = yRef.current;
      stopSpring();
      setDragVisual(true);
      try {
        card.setPointerCapture(state.pointerId);
      } catch {
        /* ignore */
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      if (flyingOutRef.current || event.button !== 0) {
        gestureRef.current = null;
        return;
      }
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) {
        gestureRef.current = null;
        return;
      }
      if (target.closest("[data-sheet-close]")) {
        gestureRef.current = null;
        return;
      }

      const fromGrabber = !!target.closest("[data-sheet-grabber]");
      if (!fromGrabber && !canDragRef.current) {
        gestureRef.current = null;
        return;
      }

      const state: GestureState = {
        pointerId: event.pointerId,
        startY: event.clientY,
        lastY: event.clientY,
        lastAt: event.timeStamp,
        startDragY: yRef.current,
        velocityY: 0,
        dragging: false,
        fromGrabber,
        scrollEl:
          (target.closest("[data-sheet-scroll]") as HTMLElement | null) ?? getScrollEl(card),
      };
      gestureRef.current = state;

      if (fromGrabber) {
        beginDrag(state, event.clientY, event.timeStamp);
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      const state = gestureRef.current;
      if (!state || event.pointerId !== state.pointerId) return;

      const dy = event.clientY - state.startY;

      if (!state.dragging) {
        if (!canDragRef.current) return;
        const scrollTop = state.scrollEl?.scrollTop ?? 0;
        const expandFromHalf =
          dy < -BODY_ACTIVATE_PX && multiDetentRef.current && detentRef.current !== "full";
        const pullDownFromTop = dy > BODY_ACTIVATE_PX && scrollTop <= 1;
        if (!expandFromHalf && !pullDownFromTop) return;
        beginDrag(state, event.clientY, event.timeStamp);
      }

      const elapsed = Math.max(1, event.timeStamp - state.lastAt);
      const sample = ((event.clientY - state.lastY) / elapsed) * 1000;
      state.velocityY = state.velocityY * (1 - VEL_EMA) + sample * VEL_EMA;
      state.lastY = event.clientY;
      state.lastAt = event.timeStamp;

      const h = frameHRef.current;
      const raw = state.startDragY + event.clientY - state.startY;
      setY(resistDragY(raw, h));
    };

    const finishPointer = (event: PointerEvent) => {
      const state = gestureRef.current;
      if (!state || event.pointerId !== state.pointerId) return;
      gestureRef.current = null;
      if (state.dragging) {
        settleDragRef.current(state.velocityY);
      }
    };

    const onTouchMove = (event: TouchEvent) => {
      if (gestureRef.current?.dragging) {
        event.preventDefault();
      }
    };

    card.addEventListener("pointerdown", onPointerDown);
    card.addEventListener("pointermove", onPointerMove);
    card.addEventListener("pointerup", finishPointer);
    card.addEventListener("pointercancel", finishPointer);
    card.addEventListener("touchmove", onTouchMove, { passive: false });

    return () => {
      card.removeEventListener("pointerdown", onPointerDown);
      card.removeEventListener("pointermove", onPointerMove);
      card.removeEventListener("pointerup", finishPointer);
      card.removeEventListener("pointercancel", finishPointer);
      card.removeEventListener("touchmove", onTouchMove);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initialY = yRef.current;
  const recessTransform = isRecessed
    ? `translate3d(0, ${NEST_RECESS_Y_PX}px, 0) scale(${NEST_RECESS_SCALE})`
    : "translate3d(0, 0, 0) scale(1)";

  return (
    <div
      className={cn(
        "fixed inset-0",
        zClassName,
        (flyingOut || isRecessed) && "pointer-events-none",
      )}
      aria-hidden={isRecessed || undefined}
    >
      <div
        className="absolute inset-0 transition-opacity"
        style={{
          backgroundColor: "hsl(var(--foreground))",
          opacity: backdropOpen ? maxDim : 0,
          transitionDuration: flyingOut ? "240ms" : `${NEST_RECESS_MS}ms`,
          transitionTimingFunction: NEST_RECESS_EASE,
        }}
        onClick={flyingOut || isRecessed ? undefined : () => flyOutThenDismiss()}
        aria-hidden
      />

      <div
        ref={frameRef}
        className="absolute inset-0 flex items-stretch justify-center overflow-hidden pointer-events-none"
        style={{
          paddingTop: "max(0.5rem, env(safe-area-inset-top))",
          paddingLeft: "env(safe-area-inset-left)",
          paddingRight: "env(safe-area-inset-right)",
          paddingBottom: 0,
        }}
      >
        <div
          ref={sheetLayerRef}
          className={cn(
            "relative z-10 flex h-full max-h-full w-full max-w-xl min-h-0 self-stretch",
            !isRecessed && "pointer-events-auto",
          )}
          style={{ transform: `translate3d(0, ${initialY}px, 0)` }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="flex h-full min-h-0 w-full origin-top"
            style={{
              transform: recessTransform,
              transition: isRecessed
                ? "none"
                : `transform ${NEST_RECESS_MS}ms ${NEST_RECESS_EASE}`,
              willChange: isRecessed ? "transform" : undefined,
            }}
          >
            <div
              ref={cardRef}
              role="dialog"
              aria-modal={!isRecessed}
              aria-label={title}
              className={cn(
                "relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-background shadow-2xl",
                "rounded-t-[1.35rem] rounded-b-none border border-border border-b-0",
                className,
              )}
            >
              <div
                data-sheet-grabber
                className="relative z-30 flex shrink-0 items-center justify-between px-3 pb-1 pt-1.5"
                style={{ touchAction: "none" }}
              >
                <div className="w-11" aria-hidden />
                <button
                  type="button"
                  className="flex flex-1 cursor-grab touch-none items-center justify-center py-3 active:cursor-grabbing"
                  aria-label="Dra sheet"
                  tabIndex={-1}
                >
                  <span className="block h-1.5 w-12 rounded-full bg-muted-foreground/40" />
                </button>
                <button
                  type="button"
                  data-sheet-close
                  onClick={(e) => {
                    e.stopPropagation();
                    flyOutThenDismiss();
                  }}
                  className="relative z-40 flex h-11 w-11 items-center justify-center rounded-full bg-muted/90 text-muted-foreground"
                  aria-label="Lukk"
                >
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
                    <path
                      d="M5 5L15 15M15 5L5 15"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
              {title ? (
                <div className="shrink-0 px-5 pb-3">
                  <h2 className="text-xl font-bold">{title}</h2>
                </div>
              ) : null}
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
