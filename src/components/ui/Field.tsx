import { forwardRef, useId } from "react";
import { cn } from "@/lib/cn";

const inputBase =
  "mt-1 w-full rounded-lg border bg-white px-3 py-2 text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-2 focus:ring-slate-900/10";
const inputState = (hasError: boolean) =>
  hasError
    ? "border-red-400 focus:border-red-500"
    : "border-slate-300 focus:border-slate-900";

function Label({
  htmlFor,
  children,
  required,
}: {
  htmlFor: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
      {children}
      {required && <span className="text-red-500"> *</span>}
    </label>
  );
}

function Help({ id, error, hint }: { id?: string; error?: string; hint?: string }) {
  if (!error && !hint) return null;
  return (
    <p id={id} className={cn("mt-1 text-xs", error ? "text-red-600" : "text-slate-400")}>
      {error ?? hint}
    </p>
  );
}

export interface FieldProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, hint, error, id, className, required, ...props },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const descId = hint || error ? `${inputId}-desc` : undefined;
  return (
    <div>
      <Label htmlFor={inputId} required={required}>
        {label}
      </Label>
      <input
        id={inputId}
        ref={ref}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={descId}
        className={cn(inputBase, inputState(Boolean(error)), className)}
        {...props}
      />
      <Help id={descId} error={error} hint={hint} />
    </div>
  );
});

export interface TextareaFieldProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: string;
  error?: string;
}

export const TextareaField = forwardRef<HTMLTextAreaElement, TextareaFieldProps>(
  function TextareaField({ label, hint, error, id, className, required, ...props }, ref) {
    const autoId = useId();
    const inputId = id ?? autoId;
    const descId = hint || error ? `${inputId}-desc` : undefined;
    return (
      <div>
        <Label htmlFor={inputId} required={required}>
          {label}
        </Label>
        <textarea
          id={inputId}
          ref={ref}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={descId}
          className={cn(inputBase, inputState(Boolean(error)), "resize-y", className)}
          {...props}
        />
        <Help id={descId} error={error} hint={hint} />
      </div>
    );
  },
);
