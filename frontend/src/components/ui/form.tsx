import * as React from "react";
import { cn } from "@/lib/utils";

const control =
  "w-full rounded-lg border border-border bg-surface text-sm text-fg shadow-sm transition-colors placeholder:text-fg-3 hover:border-border-strong focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-bad aria-[invalid=true]:ring-bad/20";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(control, "h-9 px-3", className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(control, "min-h-28 resize-y px-3 py-2 leading-relaxed", className)} {...props} />
  ),
);
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => (
  <select ref={ref} className={cn(control, "h-9 cursor-pointer appearance-auto px-2.5", className)} {...props}>
    {children}
  </select>
));
Select.displayName = "Select";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-sm font-medium text-fg", className)} {...props} />;
}

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  className,
  group,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  children: React.ReactNode;
  htmlFor?: string;
  className?: string;
  group?: boolean; // for button groups (Segmented): a labelled role=group instead of a <label>
}) {
  const id = React.useId();
  const foot = (
    <>
      {error ? (
        <span className="text-xs text-bad" role="alert">
          {error}
        </span>
      ) : (
        hint && <span className="text-xs text-fg-3">{hint}</span>
      )}
    </>
  );
  if (group) {
    return (
      <div role="group" aria-labelledby={id} className={cn("flex flex-col gap-1.5", className)}>
        <span id={id} className="text-sm font-medium text-fg">
          {label}
        </span>
        {children}
        {foot}
      </div>
    );
  }
  const Wrapper = htmlFor ? "div" : "label";
  return (
    <Wrapper className={cn("flex flex-col gap-1.5", className)}>
      {htmlFor ? (
        <label htmlFor={htmlFor} className="text-sm font-medium text-fg">
          {label}
        </label>
      ) : (
        <span className="text-sm font-medium text-fg">{label}</span>
      )}
      {children}
      {foot}
    </Wrapper>
  );
}

/** Segmented control (single choice). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  size = "md",
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode }[];
  ariaLabel: string;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn("inline-flex flex-wrap gap-0.5 rounded-lg bg-surface-2 p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md font-medium transition-colors",
            size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
            value === o.value ? "bg-surface text-fg shadow-sm" : "text-fg-3 hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Checkbox with label. */
export function Checkbox({
  label,
  description,
  className,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & { label: React.ReactNode; description?: React.ReactNode }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-2.5 text-sm", className)}>
      <input type="checkbox" className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-border accent-[var(--primary)]" {...props} />
      <span>
        <span className="font-medium text-fg">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-fg-3">{description}</span>}
      </span>
    </label>
  );
}
