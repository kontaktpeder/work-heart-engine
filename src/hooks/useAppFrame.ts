import { useEffect } from "react";
import { isEditableFocused } from "@/hooks/useKeyboardInset";

/**
 * Shell height: 100svh so Chrome/Safari toolbars don't squash the start screen.
 * Only shrink to visualViewport while the keyboard is open over a field.
 */
export function useAppFrame() {
  useEffect(() => {
    const sync = () => {
      const vv = window.visualViewport;
      const layoutH = window.innerHeight;
      const vvH = vv?.height ?? layoutH;
      const vvTop = vv?.offsetTop ?? 0;
      const overlap = Math.max(0, layoutH - vvH - vvTop);
      const keyboard = overlap >= 48 && isEditableFocused();
      const root = document.documentElement;
      if (keyboard) {
        root.style.setProperty("--app-height", `${Math.round(vvH)}px`);
        root.style.setProperty("--app-top", `${Math.round(vvTop)}px`);
      } else {
        root.style.setProperty("--app-height", "100svh");
        root.style.setProperty("--app-top", "0px");
      }
    };

    sync();
    const vv = window.visualViewport;
    vv?.addEventListener("resize", sync);
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    document.addEventListener("focusin", sync);
    document.addEventListener("focusout", sync);

    return () => {
      vv?.removeEventListener("resize", sync);
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
      document.removeEventListener("focusin", sync);
      document.removeEventListener("focusout", sync);
    };
  }, []);
}
