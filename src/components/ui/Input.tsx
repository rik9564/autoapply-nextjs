// frontend-ui-engineering skill: labeled inputs with error state
// ui-ux-pro-max skill: focus states visible, ARIA attributes
// React 19: ref as regular prop

import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  ref?: React.Ref<HTMLInputElement>;
}

export function Input({ label, error, hint, className, id, ref, ...props }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="space-y-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="label-xs block"
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        ref={ref}
        aria-invalid={!!error}
        aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
        className={cn(
          "w-full h-10 px-3 text-sm rounded-[var(--radius-sm)]",
          error && "border-[var(--status-error)] focus:shadow-[0_0_0_2px_var(--status-error-bg)]",
          className
        )}
        {...props}
      />
      {error && (
        <p id={`${inputId}-error`} role="alert" className="text-[10px] text-[var(--status-error)]">
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={`${inputId}-hint`} className="text-[10px] text-[var(--fg-tertiary)]">
          {hint}
        </p>
      )}
    </div>
  );
}

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  ref?: React.Ref<HTMLTextAreaElement>;
}

export function Textarea({ label, error, hint, className, id, ref, ...props }: TextareaProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="label-xs block">
          {label}
        </label>
      )}
      <textarea
        id={inputId}
        ref={ref}
        aria-invalid={!!error}
        className={cn(
          "w-full px-3 py-2 text-sm rounded-[var(--radius-sm)] resize-none leading-relaxed",
          error && "border-[var(--status-error)]",
          className
        )}
        {...props}
      />
      {error && (
        <p role="alert" className="text-[10px] text-[var(--status-error)]">{error}</p>
      )}
      {hint && !error && (
        <p className="text-[10px] text-[var(--fg-tertiary)]">{hint}</p>
      )}
    </div>
  );
}
