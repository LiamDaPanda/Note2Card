"use client";

import { useEffect, useRef, type TextareaHTMLAttributes } from "react";
import { cn } from "./cn";

/**
 * A textarea that grows with its content, so a card's two sides are always fully
 * visible while editing — no inner scrollbars in the editor list.
 */
export function AutoTextarea({
  className,
  value,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      rows={1}
      className={cn(
        "w-full resize-none bg-transparent text-ink outline-none placeholder:text-ink-3",
        className,
      )}
      {...props}
    />
  );
}
