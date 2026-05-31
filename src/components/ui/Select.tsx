import { forwardRef, useId } from "react";
import { cn } from "@/lib/cn";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: SelectOption[];
  label?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { options, label, id, className, ...props },
  ref,
) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const field = (
    <select
      ref={ref}
      id={selectId}
      className={cn(
        "rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10",
        className,
      )}
      {...props}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );

  if (!label) return field;
  return (
    <label htmlFor={selectId} className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {field}
    </label>
  );
});
