"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/cn";

// Country dial codes offered in the prefix picker. Slovakia is the default and
// the EU neighbours / common destinations cover the realistic caller base.
const COUNTRIES = [
  { code: "+421", flag: "🇸🇰", name: "Slovensko" },
  { code: "+420", flag: "🇨🇿", name: "Česko" },
  { code: "+43", flag: "🇦🇹", name: "Rakúsko" },
  { code: "+36", flag: "🇭🇺", name: "Maďarsko" },
  { code: "+48", flag: "🇵🇱", name: "Poľsko" },
  { code: "+49", flag: "🇩🇪", name: "Nemecko" },
  { code: "+380", flag: "🇺🇦", name: "Ukrajina" },
  { code: "+44", flag: "🇬🇧", name: "Veľká Británia" },
  { code: "+39", flag: "🇮🇹", name: "Taliansko" },
  { code: "+33", flag: "🇫🇷", name: "Francúzsko" },
  { code: "+34", flag: "🇪🇸", name: "Španielsko" },
  { code: "+41", flag: "🇨🇭", name: "Švajčiarsko" },
  { code: "+385", flag: "🇭🇷", name: "Chorvátsko" },
  { code: "+386", flag: "🇸🇮", name: "Slovinsko" },
  { code: "+40", flag: "🇷🇴", name: "Rumunsko" },
  { code: "+359", flag: "🇧🇬", name: "Bulharsko" },
  { code: "+1", flag: "🇺🇸", name: "USA / Kanada" },
] as const;

const DEFAULT_CODE = "+421";

// Match the longest dial code first so "+421" wins over shorter overlaps.
const CODES_BY_LEN = COUNTRIES.map((c) => c.code).sort(
  (a, b) => b.length - a.length,
);

/** Split a stored phone string into a known dial code + national part. */
function parsePhone(raw: string): { code: string; national: string } {
  const v = raw.trim();
  if (!v) return { code: DEFAULT_CODE, national: "" };
  if (v.startsWith("+")) {
    const code = CODES_BY_LEN.find((c) => v.startsWith(c));
    if (code) return { code, national: v.slice(code.length).trim() };
    // Unknown international code — keep it visible so the user can fix it.
    return { code: DEFAULT_CODE, national: v };
  }
  // Local format: a leading trunk "0" maps to the national number (0917 → +421 917).
  const national = v.startsWith("0") ? v.slice(1) : v;
  return { code: DEFAULT_CODE, national: national.trim() };
}

/** Empty national part yields "" so `required`/`!phone` checks still fire. */
function compose(code: string, national: string): string {
  const n = national.trim();
  return n ? `${code} ${n}` : "";
}

export function PhoneField({
  label,
  value,
  onChange,
  required,
  disabled,
  hint,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  hint?: string;
  error?: string;
}) {
  const id = useId();
  const initial = parsePhone(value);
  const [code, setCode] = useState(initial.code);
  const [national, setNational] = useState(initial.national);
  const descId = hint || error ? `${id}-desc` : undefined;

  function update(nextCode: string, nextNational: string) {
    setCode(nextCode);
    setNational(nextNational);
    onChange(compose(nextCode, nextNational));
  }

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <div
        className={cn(
          "mt-1 flex rounded-lg border bg-white transition focus-within:ring-2 focus-within:ring-slate-900/10",
          error
            ? "border-red-400 focus-within:border-red-500"
            : "border-slate-300 focus-within:border-slate-900",
          disabled && "bg-slate-50",
        )}
      >
        <select
          aria-label="Medzinárodná predvoľba"
          value={code}
          disabled={disabled}
          onChange={(e) => update(e.target.value, national)}
          className="shrink-0 rounded-l-lg border-r border-slate-200 bg-transparent py-2 pl-3 pr-1 text-slate-900 outline-none disabled:cursor-not-allowed disabled:text-slate-500"
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.flag} {c.code}
            </option>
          ))}
        </select>
        <input
          id={id}
          type="tel"
          inputMode="tel"
          required={required}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={descId}
          value={national}
          onChange={(e) => update(code, e.target.value.replace(/[^\d ]/g, ""))}
          placeholder="917 588 738"
          className="w-full rounded-r-lg bg-transparent px-3 py-2 text-slate-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:text-slate-500"
        />
      </div>
      {(error || hint) && (
        <p
          id={descId}
          className={cn("mt-1 text-xs", error ? "text-red-600" : "text-slate-400")}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
