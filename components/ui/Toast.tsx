"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Check, Undo2 } from "lucide-react";

interface ToastMessage {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

interface ToastApi {
  show: (text: string, action?: ToastMessage["action"]) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used inside <ToastProvider>");
  return api;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);
  const nextId = useRef(0);

  const show = useCallback((text: string, action?: ToastMessage["action"]) => {
    const id = (nextId.current += 1);
    setMessages((current) => [...current, { id, text, action }]);
    window.setTimeout(() => {
      setMessages((current) => current.filter((m) => m.id !== id));
    }, action ? 6000 : 2400);
  }, []);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
      >
        {messages.map((message) => (
          <div
            key={message.id}
            className="n2c-rise pointer-events-auto flex items-center gap-3 rounded-full border border-line bg-surface py-2 pl-4 pr-2 shadow-lg"
          >
            <Check aria-hidden className="size-4 shrink-0 text-ok" />
            <span className="text-sm font-medium text-ink">{message.text}</span>
            {message.action ? (
              <button
                type="button"
                onClick={() => {
                  message.action?.run();
                  setMessages((current) => current.filter((m) => m.id !== message.id));
                }}
                className="ml-1 inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium text-accent hover:bg-accent-soft"
              >
                <Undo2 aria-hidden className="size-3.5" />
                {message.action.label}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
