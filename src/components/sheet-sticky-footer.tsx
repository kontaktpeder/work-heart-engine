import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useKeyboardInset } from "@/hooks/useKeyboardInset";

type Props = {
  children: ReactNode;
  className?: string;
};

/**
 * Footer pinned to the bottom of a ContentSheet.
 * Lifts above the keyboard without resizing the sheet frame.
 */
export function SheetStickyFooter({ children, className }: Props) {
  const keyboardInset = useKeyboardInset();
  const keyboardOpen = keyboardInset > 24;

  return (
    <div
      data-sheet-footer
      className={cn(
        "shrink-0 border-t border-border/60 bg-background px-5 pt-3",
        keyboardOpen ? "pb-3" : "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
        className,
      )}
      style={{
        transform: keyboardOpen ? `translate3d(0, -${keyboardInset}px, 0)` : undefined,
        willChange: keyboardOpen ? "transform" : undefined,
      }}
    >
      {children}
    </div>
  );
}
