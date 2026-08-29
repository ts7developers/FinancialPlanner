"use client";

// Shared feedback surface for anything new we build (undo-delete flows, bulk actions, nudge
// banners) so they all look and behave identically — same placement, same undo-window styling —
// rather than each tab inventing its own local flash/error state. Existing per-tab flash/error
// implementations are left alone (they already work); this is the one place new code should go.

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Toast } from "@/components/ui/atoms";

interface ToastOptions {
  actionLabel?: string;
  onAction?: () => void;
  /** Defaults to 5s when there's an action to give time to click it, 3.2s otherwise. */
  durationMs?: number;
}

type ToastFn = (message: string, opts?: ToastOptions) => void;

const ToastContext = createContext<ToastFn | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<{ message: string; actionLabel?: string; onAction?: () => void } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback<ToastFn>((message, opts = {}) => {
    if (timer.current) clearTimeout(timer.current);
    setCurrent({ message, actionLabel: opts.actionLabel, onAction: opts.onAction });
    timer.current = setTimeout(() => setCurrent(null), opts.durationMs ?? (opts.actionLabel ? 5000 : 3200));
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {current && (
        <Toast
          message={current.message}
          actionLabel={current.actionLabel}
          onAction={
            current.onAction
              ? () => {
                  if (timer.current) clearTimeout(timer.current);
                  current.onAction?.();
                  setCurrent(null);
                }
              : undefined
          }
        />
      )}
    </ToastContext.Provider>
  );
}

/** Call as `toast("Saved")` or `toast("Removed", { actionLabel: "Undo", onAction: () => ... })`. */
export function useToast(): ToastFn {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
