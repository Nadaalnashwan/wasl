import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn("sketch-input h-11 w-full px-3 text-base placeholder:text-ink-faint", className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn("sketch-input min-h-28 w-full resize-y px-3 py-2.5 text-base leading-relaxed placeholder:text-ink-faint", className)} {...props} />
  ),
);
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => (
  <select ref={ref} className={cn("sketch-input h-11 w-full cursor-pointer px-3 text-base", className)} {...props}>
    {children}
  </select>
));
Select.displayName = "Select";

export function Field({
  label,
  hint,
  children,
  htmlFor,
  className,
  group,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  htmlFor?: string;
  className?: string;
  group?: boolean; // for button groups (Segmented): a labelled role=group instead of a <label>
}) {
  const id = React.useId();
  if (group) {
    return (
      <div role="group" aria-labelledby={id} className={cn("flex flex-col gap-1.5", className)}>
        <span id={id} className="font-hand text-lg leading-none">
          {label}
        </span>
        {children}
        {hint && <span className="text-xs text-ink-faint">{hint}</span>}
      </div>
    );
  }
  // Without htmlFor the <label> wraps the control, giving it an accessible name implicitly.
  const Wrapper = htmlFor ? "div" : "label";
  return (
    <Wrapper className={cn("flex flex-col gap-1.5", className)}>
      {htmlFor ? (
        <label htmlFor={htmlFor} className="font-hand text-lg leading-none">
          {label}
        </label>
      ) : (
        <span className="font-hand text-lg leading-none">{label}</span>
      )}
      {children}
      {hint && <span className="text-xs text-ink-faint">{hint}</span>}
    </Wrapper>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode }[];
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "sketch-pill px-3 py-1 font-hand text-base transition-colors",
            value === o.value ? "bg-brand text-brand-ink" : "bg-paper hover:bg-sky",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
