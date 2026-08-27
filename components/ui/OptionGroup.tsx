"use client";

import { cn } from "./cn";

export interface Option<T extends string | number> {
  value: T;
  label: string;
}

/**
 * A segmented control. Used instead of a <select> because all the choices here
 * are short and seeing them all at once is faster than opening a menu.
 */
export function OptionGroup<T extends string | number>({
  label,
  options,
  value,
  onChange,
  name,
  orientation = "row",
}: {
  label: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  name: string;
  /**
   * "stack" lays the choices out vertically. Long labels wrapping inside a
   * horizontal segmented control break out of its rounded background, so groups
   * with wordy options stack instead of wrapping.
   */
  orientation?: "row" | "stack";
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-sm font-medium text-ink-2">{label}</legend>
      <div
        role="radiogroup"
        aria-label={label}
        className={cn(
          "flex gap-1.5 rounded-xl bg-surface-2 p-1",
          orientation === "stack" ? "flex-col" : "flex-row",
        )}
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={String(option.value)}
              type="button"
              role="radio"
              aria-checked={selected}
              name={name}
              onClick={() => onChange(option.value)}
              className={cn(
                "whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-150",
                orientation === "stack" ? "w-full text-left" : "flex-1",
                selected
                  ? "bg-surface text-ink shadow-sm"
                  : "text-ink-2 hover:text-ink",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
