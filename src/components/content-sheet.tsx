import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { X } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
};

const DISMISS_DISTANCE = 140;
const DISMISS_VELOCITY = 720;

export function ContentSheet({ open, onClose, title, children, className = "" }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const gesture = useRef({
    pointerId: -1,
    startY: 0,
    lastY: 0,
    lastAt: 0,
    velocity: 0,
    dragging: false,
  });

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  function move(y: number) {
    if (sheetRef.current)
      sheetRef.current.style.transform = `translate3d(0, ${Math.max(0, y)}px, 0)`;
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    const fromGrabber = !!target.closest("[data-sheet-grabber]");
    const scroll = target.closest("[data-sheet-scroll]") as HTMLElement | null;
    if (!fromGrabber && (scroll?.scrollTop ?? 0) > 0) return;
    gesture.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      lastY: event.clientY,
      lastAt: event.timeStamp,
      velocity: 0,
      dragging: fromGrabber,
    };
    if (fromGrabber) event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const state = gesture.current;
    if (state.pointerId !== event.pointerId) return;
    const dy = event.clientY - state.startY;
    if (!state.dragging) {
      if (dy < 8) return;
      state.dragging = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const elapsed = Math.max(1, event.timeStamp - state.lastAt);
    state.velocity =
      state.velocity * 0.65 + ((event.clientY - state.lastY) / elapsed) * 1000 * 0.35;
    state.lastY = event.clientY;
    state.lastAt = event.timeStamp;
    move(dy);
  }

  function onPointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const state = gesture.current;
    if (state.pointerId !== event.pointerId) return;
    const dy = event.clientY - state.startY;
    gesture.current.pointerId = -1;
    if (state.dragging && (dy > DISMISS_DISTANCE || state.velocity > DISMISS_VELOCITY)) {
      if (sheetRef.current) sheetRef.current.style.transform = "translate3d(0, 100%, 0)";
      window.setTimeout(onClose, 180);
      return;
    }
    if (sheetRef.current) sheetRef.current.style.transform = "translate3d(0, 0, 0)";
  }

  return (
    <div className="fixed inset-0 z-50 bg-foreground/35" role="presentation" onClick={onClose}>
      <div className="absolute inset-0 flex items-end justify-center overflow-hidden">
        <div
          ref={sheetRef}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          className={`flex max-h-[92dvh] w-full max-w-xl touch-pan-y flex-col overflow-hidden rounded-t-[1.35rem] border border-border bg-background shadow-2xl transition-transform duration-200 ease-out ${className}`}
        >
          <div data-sheet-grabber className="flex shrink-0 touch-none items-center px-3 pb-1 pt-2">
            <div className="w-11" />
            <div className="flex flex-1 justify-center py-2.5">
              <span className="h-1.5 w-12 rounded-full bg-muted-foreground/35" />
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground"
              aria-label="Lukk"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="shrink-0 px-5 pb-3">
            <h2 className="text-xl font-bold">{title}</h2>
          </div>
          <div
            data-sheet-scroll
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
