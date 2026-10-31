import { useId } from "react";
import { cn } from "@/lib/cn";

/**
 * The patient's Poznámky subcategories in red, side by side. Read-only
 * wherever a note is shown — membership changes only on the /poznamky page.
 * A <span>, so it can sit inside the clickable note button.
 */
export function NoteCategoryLine({
  names,
  className,
}: {
  names: string[];
  className?: string;
}) {
  if (names.length === 0) return null;
  return (
    <span className={cn("block text-sm font-semibold text-red-600", className)}>
      {names.join(", ")}
    </span>
  );
}

/**
 * The "Poznámka" field: one box whose first line is the red subcategory line
 * and whose second line is the free-text note anyone may write in black. Only
 * the black text is editable here.
 */
export function PatientNoteField({
  categories,
  value,
  onChange,
  rows = 2,
}: {
  categories: string[];
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  const id = useId();
  const hasCategories = categories.length > 0;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        Poznámka
      </label>
      <div className="mt-1 rounded-lg border border-slate-300 bg-white transition focus-within:border-slate-900 focus-within:ring-2 focus-within:ring-slate-900/10">
        <NoteCategoryLine
          names={categories}
          className="px-3 pt-2 [overflow-wrap:anywhere]"
        />
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          className={cn(
            "block w-full resize-y rounded-lg bg-transparent px-3 text-slate-900 outline-none placeholder:text-slate-400",
            hasCategories ? "pb-2 pt-1" : "py-2",
          )}
        />
      </div>
    </div>
  );
}
