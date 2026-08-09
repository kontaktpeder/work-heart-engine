import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { runSheetEaseOut, runSheetSpring, SETTLE_SPRING } from "@/lib/sheetMotion";

const COMMIT_RATIO = 0.18;
const COMMIT_VELOCITY = 380;
const ACTIVATE_PX = 12;
const AXIS_LOCK = 1.15;
const RUBBER = 0.28;

type Props = {
  index: number;
  onIndexChange: (index: number) => void;
  children: ReactNode[];
};

/**
 * Horizontal pager — panes stay mounted; soft swipe like Dagen Vår.
 */
export function WorkPager({ index, onIndexChange, children }: Props) {
  const count = children.length;
  const frameRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const xRef = useRef(0);
  const indexRef = useRef(index);
  const cancelAnim = useRef<(() => void) | null>(null);
  const gesture = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    lastX: number;
    lastAt: number;
    startOffset: number;
    velocity: number;
    axis: "none" | "x" | "y";
    dragging: boolean;
  } | null>(null);

  indexRef.current = index;

  const writeX = (x: number) => {
    xRef.current = x;
    if (trackRef.current) {
      trackRef.current.style.transform = `translate3d(${x}px, 0, 0)`;
    }
  };

  const stopAnim = () => {
    cancelAnim.current?.();
    cancelAnim.current = null;
  };

  const settleTo = (nextIndex: number, velocity = 0) => {
    const clamped = Math.max(0, Math.min(count - 1, nextIndex));
    const target = -clamped * width;
    stopAnim();
    if (trackRef.current) trackRef.current.style.willChange = "transform";

    const finish = () => {
      cancelAnim.current = null;
      writeX(target);
      if (trackRef.current) trackRef.current.style.willChange = "";
      if (clamped !== indexRef.current) onIndexChange(clamped);
    };

    const distance = Math.abs(target - xRef.current);
    if (distance < 1) {
      finish();
      return;
    }

    cancelAnim.current = runSheetSpring({
      from: xRef.current,
      to: target,
      velocity: velocity * 0.35,
      spring: SETTLE_SPRING,
      onUpdate: writeX,
      onComplete: finish,
    });
  };

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!width) return;
    stopAnim();
    writeX(-index * width);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width]);

  useEffect(() => {
    if (!width) return;
    if (gesture.current?.dragging) return;
    const target = -index * width;
    if (Math.abs(xRef.current - target) < 1) {
      writeX(target);
      return;
    }
    stopAnim();
    cancelAnim.current = runSheetEaseOut({
      from: xRef.current,
      to: target,
      duration: 0.28,
      onUpdate: writeX,
      onComplete: () => {
        cancelAnim.current = null;
        writeX(target);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, width]);

  useEffect(() => () => stopAnim(), []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const onTouchMove = (event: TouchEvent) => {
      if (gesture.current?.dragging && gesture.current.axis === "x") {
        event.preventDefault();
      }
    };
    track.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => track.removeEventListener("touchmove", onTouchMove);
  }, []);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !width) return;
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, button, a, [data-no-pager-swipe]")) {
      gesture.current = null;
      return;
    }
    stopAnim();
    gesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastAt: event.timeStamp,
      startOffset: xRef.current,
      velocity: 0,
      axis: "none",
      dragging: false,
    };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const state = gesture.current;
    if (!state || state.pointerId !== event.pointerId || !width) return;

    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;

    if (state.axis === "none") {
      if (Math.abs(dx) < ACTIVATE_PX && Math.abs(dy) < ACTIVATE_PX) return;
      state.axis = Math.abs(dx) > Math.abs(dy) * AXIS_LOCK ? "x" : "y";
      if (state.axis === "y") {
        gesture.current = null;
        return;
      }
      state.dragging = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      if (trackRef.current) trackRef.current.style.willChange = "transform";
    }

    if (state.axis !== "x") return;

    const elapsed = Math.max(1, event.timeStamp - state.lastAt);
    state.velocity =
      state.velocity * 0.65 + ((event.clientX - state.lastX) / elapsed) * 1000 * 0.35;
    state.lastX = event.clientX;
    state.lastAt = event.timeStamp;

    const min = -(count - 1) * width;
    const max = 0;
    const raw = state.startOffset + dx;
    if (raw > max) writeX(max + (raw - max) * RUBBER);
    else if (raw < min) writeX(min + (raw - min) * RUBBER);
    else writeX(raw);
  }

  function onPointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const state = gesture.current;
    if (!state || state.pointerId !== event.pointerId) return;
    gesture.current = null;
    if (!state.dragging || !width) return;

    const dx = xRef.current - state.startOffset;
    const flicked = Math.abs(state.velocity) > COMMIT_VELOCITY;
    const dragged = Math.abs(dx) > width * COMMIT_RATIO;
    let next = indexRef.current;
    if (flicked || dragged) {
      if (dx < 0 || state.velocity < -COMMIT_VELOCITY) next += 1;
      else if (dx > 0 || state.velocity > COMMIT_VELOCITY) next -= 1;
    }
    settleTo(next, state.velocity);
  }

  return (
    <div ref={frameRef} className="relative min-h-0 flex-1 overflow-hidden touch-pan-y">
      <div
        ref={trackRef}
        className="flex h-full"
        style={{
          width: width ? width * count : "100%",
          transform: `translate3d(${-index * (width || 0)}px, 0, 0)`,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        {children.map((child, i) => (
          <div
            key={i}
            className="scroll-touch h-full shrink-0 overflow-y-auto overscroll-contain pb-[max(1.25rem,env(safe-area-inset-bottom))]"
            style={{ width: width || "100%" }}
            aria-hidden={i !== index}
          >
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}
