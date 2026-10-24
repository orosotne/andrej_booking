// Client-only helpers for the isolated print sheets (.print-sheet in
// globals.css): the one-day table from the calendar and the Súhrn month.

/** A4 portrait minus the 14 mm @page margins (globals.css) — the printable box. */
export const PRINT_AREA_MM = { width: 182, height: 269 };

const PX_PER_MM = 96 / 25.4;
// Head-room for rounding and for the browser's own header/footer lines.
const SAFETY = 0.97;

/**
 * Shrinks a print sheet onto exactly one page. The sheet is laid out off-screen
 * at the printable width (body.measuring-sheet); when it is taller than a page
 * it is widened in proportion and zoomed back down, so the printout keeps the
 * full page width instead of shrinking into a narrow strip. Returns the zoom.
 */
export function fitToPage(el: HTMLElement): number {
  const pageHeight = PRINT_AREA_MM.height * PX_PER_MM * SAFETY;
  document.body.classList.add("measuring-sheet");
  try {
    el.style.zoom = "";
    el.style.width = `${PRINT_AREA_MM.width}mm`;
    const first = Math.min(1, pageHeight / el.scrollHeight);
    let fit = first;
    if (first < 1) {
      el.style.width = `${PRINT_AREA_MM.width / first}mm`;
      // Re-measured at the wider width; never zoom past `first`, or the sheet
      // would end up wider than the page.
      fit = Math.min(first, pageHeight / el.scrollHeight);
    }
    el.style.zoom = String(fit);
    return fit;
  } finally {
    document.body.classList.remove("measuring-sheet");
  }
}

/**
 * Prints only `el` — a .print-sheet portalled to <body> — fitted onto one A4.
 * `onDone` runs once the print dialog has closed.
 */
export function printSheet(el: HTMLElement, onDone?: () => void): void {
  fitToPage(el);
  document.body.classList.add("printing-sheet");
  const cleanup = () => {
    document.body.classList.remove("printing-sheet");
    window.removeEventListener("afterprint", cleanup);
    onDone?.();
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
}
