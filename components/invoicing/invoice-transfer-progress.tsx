"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Circle, CircleAlert } from "lucide-react";
import {
  transferPending,
  type SagaTransfer,
} from "@/lib/invoicing/saga-transfer";
import { InvoiceLoading, InvoiceSpinner } from "./invoice-feedback";

export function InvoiceTransferProgress({
  transfer: t,
}: {
  transfer: SagaTransfer;
}) {
  const pending = transferPending(t);
  // Lease renewals/poll responses are not progress. Only meaningful changes reset the timer.
  const progress = JSON.stringify([
    t.id,
    t.phase,
    t.importStatus,
    t.stockStatus,
    t.cursor,
    t.attempts,
    t.groups.map((g) => [g.before, g.after]),
  ]);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    if (!pending) return;
    const timer = setTimeout(() => setSlow(true), 30_000);
    return () => clearTimeout(timer);
  }, [progress, pending]);
  const noStock = !t.groups.length;
  const steps = [
    {
      label: "Stoc inițial",
      active: t.phase === "baseline" && !noStock,
      done: !noStock && t.groups.every((g) => !!g.before),
      warning: t.stockStatus === "blocked",
      skipped: noStock,
    },
    {
      label: "Trimitere factură",
      active: t.phase === "ready" || t.phase === "sending",
      done: t.importStatus === "imported",
      warning: ["partial", "failed", "unknown"].includes(t.importStatus),
      skipped: false,
    },
    {
      label: "Verificare stoc",
      active: t.phase === "after" && !noStock,
      done: t.stockStatus === "observed",
      warning: !pending && t.stockStatus === "not_confirmed",
      skipped: noStock,
    },
  ];
  const label = {
    baseline: noStock
      ? "Se pregătește trimiterea…"
      : "Se citește stocul inițial…",
    ready: "În așteptarea trimiterii…",
    sending:
      t.mode === "dry-run"
        ? "Se simulează trimiterea facturii…"
        : "Se trimite factura în SAGA…",
    after: noStock
      ? "Se încheie procesarea…"
      : "Se verifică scăderea stocului…",
    done: "",
    blocked: "",
    review: "",
  }[t.phase];
  return (
    <div className="space-y-2" aria-label="Progres factură SAGA">
      <ol className="grid gap-2 sm:grid-cols-3" aria-label="Etapele procesării">
        {steps.map((step) => (
          <li
            key={step.label}
            aria-current={step.active ? "step" : undefined}
            className={`flex items-center gap-2 rounded border p-2 text-xs ${step.active ? "border-blue-300 bg-blue-50 text-blue-900" : step.warning ? "text-amber-800" : step.done ? "text-emerald-800" : "text-slate-500"}`}
          >
            {step.active ? (
              <InvoiceSpinner />
            ) : step.warning ? (
              <CircleAlert aria-hidden className="h-4 w-4 shrink-0" />
            ) : step.done ? (
              <CheckCircle2 aria-hidden className="h-4 w-4 shrink-0" />
            ) : (
              <Circle aria-hidden className="h-4 w-4 shrink-0" />
            )}
            <span>
              {step.label}
              <span className="sr-only">
                {step.active
                  ? " — în curs"
                  : step.warning
                    ? " — necesită atenție"
                    : step.done
                      ? " — încheiat"
                      : step.skipped
                        ? " — neaplicabil"
                        : " — în așteptare"}
              </span>
            </span>
          </li>
        ))}
      </ol>
      {pending && <InvoiceLoading>{label}</InvoiceLoading>}
      {pending && slow && (
        <p role="status" className="text-xs text-slate-600">
          Procesarea durează mai mult… Ultima actualizare:{" "}
          {new Date(t.updatedAt).toLocaleString("ro-RO")}.
        </p>
      )}
    </div>
  );
}
