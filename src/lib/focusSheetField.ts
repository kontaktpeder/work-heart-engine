/**
 * Blur active field so sheet drag / dismiss isn't fought by the keyboard.
 */
export function blurSheetField() {
  const ae = document.activeElement;
  if (ae instanceof HTMLElement) ae.blur();
}

/** Scroll a focused field into the visible area after the keyboard has risen. */
export function revealFocusedField(el: HTMLElement) {
  const run = () => {
    el.scrollIntoView({ block: "center", inline: "nearest" });
  };
  run();
  requestAnimationFrame(run);
  window.setTimeout(run, 280);
}
