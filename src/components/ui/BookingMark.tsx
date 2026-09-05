import {
  bookingColor,
  bookingShape,
  leadTimeDays,
  type BookingColor,
  type BookingShape,
} from "@/lib/booking-mark";

const FILL: Record<BookingColor, string> = {
  red: "#dc2626",
  green: "#16a34a",
  blue: "#2563eb",
  gray: "#94a3b8",
};

const SHAPE_LABEL: Record<BookingShape, string> = {
  full: "objednané viac ako 250 dní vopred",
  half: "objednané 100 až 250 dní vopred",
  quarter: "objednané menej ako 100 dní vopred",
};

/**
 * Circle / half circle / quarter circle showing how far ahead the booking was
 * made, coloured by patient category. Sized via className (defaults to 14px).
 */
export function BookingMark({
  createdAt,
  startAt,
  patientCategory,
  appointmentType,
  className = "h-3.5 w-3.5",
}: {
  createdAt: string;
  startAt: string;
  patientCategory: string | null | undefined;
  appointmentType: string;
  className?: string;
}) {
  const days = leadTimeDays(createdAt, startAt);
  const shape = bookingShape(days);
  const fill = FILL[bookingColor(patientCategory, appointmentType)];
  const label = `${SHAPE_LABEL[shape]} (${days} d)`;
  return (
    <svg
      viewBox="0 0 16 16"
      className={`shrink-0 ${className}`}
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      <circle cx="8" cy="8" r="7" fill="none" stroke={fill} strokeWidth="1.5" />
      {shape === "full" && <circle cx="8" cy="8" r="7" fill={fill} />}
      {shape === "half" && <path d="M8 1 A7 7 0 0 1 8 15 Z" fill={fill} />}
      {shape === "quarter" && <path d="M8 1 A7 7 0 0 1 15 8 L8 8 Z" fill={fill} />}
    </svg>
  );
}
