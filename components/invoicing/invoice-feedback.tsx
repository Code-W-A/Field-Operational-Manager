"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Loader2 } from "lucide-react";

export function InvoiceSpinner() {
  return (
    <Loader2
      aria-hidden="true"
      className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none"
    />
  );
}

export function InvoiceLoading({ children }: { children: ReactNode }) {
  return (
    <span
      role="status"
      aria-live="polite"
      className="inline-flex items-center gap-2 text-sm"
    >
      <InvoiceSpinner />
      {children}
    </span>
  );
}

export function InvoiceAction({
  pending,
  children,
  label,
}: {
  pending: boolean;
  children: ReactNode;
  label: string;
}) {
  // A nested role="status" suppresses its text in the button's accessible name.
  return pending ? (
    <span aria-live="polite" className="inline-flex items-center gap-2">
      <InvoiceSpinner />
      {label}
    </span>
  ) : (
    <>{children}</>
  );
}

/** Each child owns a key: finishing one request cannot unlock another request. */
export function useInvoiceActivity(onBusy?: (busy: boolean) => void) {
  const active = useRef(new Set<string>());
  const callback = useRef(onBusy);
  callback.current = onBusy;
  const [busy, setBusy] = useState(false);
  const setActivity = useCallback((key: string, pending: boolean) => {
    const before = active.current.size > 0;
    if (pending) active.current.add(key);
    else active.current.delete(key);
    const after = active.current.size > 0;
    if (before !== after) {
      setBusy(after);
      callback.current?.(after);
    }
  }, []);
  useEffect(
    () => () => {
      if (active.current.size) callback.current?.(false);
      active.current.clear();
    },
    [],
  );
  return { busy, setActivity };
}
