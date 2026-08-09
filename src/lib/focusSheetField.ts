/**
 * Blur active field so sheet drag / dismiss isn't fought by the keyboard.
 */
export function blurSheetField() {
  const ae = document.activeElement;
  if (ae instanceof HTMLElement) ae.blur();
}
