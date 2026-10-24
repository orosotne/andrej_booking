"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { printSheet } from "@/lib/print-fit";

/**
 * Mount to print `children` on their own, fitted onto exactly one A4 page
 * (printSheet). The sheet is portalled to <body> and invisible on screen;
 * `onDone` fires when the print dialog closes, which is the cue to unmount it.
 */
export function PrintSheet({
  children,
  onDone,
}: {
  children: React.ReactNode;
  onDone: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onDoneRef = useRef(onDone);
  const started = useRef(false);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    // Once per mount, also under StrictMode's double effect run in dev.
    if (started.current || !ref.current) return;
    started.current = true;
    printSheet(ref.current, () => onDoneRef.current());
  }, []);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div ref={ref} className="print-sheet" aria-hidden="true">
      {children}
    </div>,
    document.body,
  );
}
