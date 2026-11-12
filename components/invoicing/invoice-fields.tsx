"use client";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { commercialAmounts, dueFromTerm } from "@/lib/invoicing/commercial";
import type {
  InvoiceContent,
  InvoiceDraft,
  InvoiceLine,
} from "@/lib/invoicing/draft";
import {
  InvoiceSagaSelection,
  useInvoiceSagaList,
  type InvoiceStock,
} from "./invoice-saga-selection";
import { useCommercialTicketRequest } from "./invoice-commercial";

const fiscalFields = {
  name: "Denumire beneficiar",
  cui: "CUI/CIF",
  registration: "Nr. registrul comerțului",
  address: "Adresă fiscală",
  country: "Țara beneficiarului",
  county: "Județ beneficiar (cod, ex. IF)",
  city: "Localitate beneficiar",
  bank: "Bancă",
  iban: "Cont bancar",
  phone: "Telefon beneficiar",
  email: "Email beneficiar",
} as const;
export function InvoiceHeaderFields({
  draft,
  readOnly,
  onChange,
}: {
  draft: InvoiceDraft;
  readOnly: boolean;
  onChange: (patch: Partial<InvoiceContent>) => void;
}) {
  const { user } = useAuth();
  const actor = useRef(user);
  actor.current = user;
  const request = useCommercialTicketRequest(draft.workId);
  const [context, setContext] = useState<{
    agent?: { code: string; name: string };
  } | null>(null);
  const [vatCash, setVatCash] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [fiscalOpen, setFiscalOpen] = useState(
    () =>
      !draft.beneficiary.address ||
      !draft.beneficiary.country ||
      !draft.beneficiary.city ||
      !draft.beneficiary.name,
  );
  useEffect(() => {
    let disposed = false;
    void request("/commercial-context")
      .then((value) => {
        if (!disposed) setContext(value);
      })
      .catch(() => {
        if (!disposed) setError("Agentul nu poate fi încărcat momentan.");
      });
    void (async () => {
      try {
        const token = await actor.current?.getIdToken();
        const r = await fetch("/api/integrations/saga/issuer", {
          cache: "no-store",
          headers: { Authorization: `Bearer ${token || ""}` },
        });
        const v = await r.json();
        if (!r.ok) throw new Error();
        if (!disposed) setVatCash(v.profile?.vatCashAccounting ?? null);
      } catch {
        if (!disposed)
          setError("Datele emitentului nu pot fi încărcate momentan.");
      }
    })();
    return () => {
      disposed = true;
    };
  }, [draft.workId, draft.revision, user?.uid]);
  return (
    <fieldset disabled={readOnly} className="space-y-3">
      <legend className="sr-only">Datele facturii</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          Data emiterii
          <Input
            aria-label="invoice: Data documentului"
            type="date"
            value={draft.date}
            onChange={(e) =>
              onChange({
                date: e.target.value,
                ...(draft.commercial?.dueMode === "auto"
                  ? {
                      dueDate: dueFromTerm(
                        e.target.value,
                        draft.commercial.termDays,
                      ),
                    }
                  : {}),
              })
            }
          />
        </label>
        <label className="text-sm">
          Scadență
          <Input
            aria-label="invoice: Scadență"
            type="date"
            value={draft.dueDate}
            onChange={(e) =>
              onChange({
                dueDate: e.target.value,
                ...(draft.commercial
                  ? { commercial: { ...draft.commercial, dueMode: "manual" } }
                  : {}),
              })
            }
          />
        </label>
      </div>
      {draft.commercial?.dueMode === "manual" &&
        draft.commercial.termDays !== null && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              onChange({
                commercial: { ...draft.commercial!, dueMode: "auto" },
                dueDate: dueFromTerm(draft.date, draft.commercial!.termDays),
              })
            }
          >
            Revino la scadență automată
          </Button>
        )}
      {draft.commercial?.termDays === null && !draft.dueDate && (
        <p className="text-sm text-amber-800">Completează scadența.</p>
      )}
      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <p>
          Agent ·{" "}
          {context?.agent
            ? `${context.agent.name} (${context.agent.code})`
            : "De configurat în pagina utilizatorului"}
        </p>
        <p>
          TVA la încasare ·{" "}
          {vatCash === null
            ? "De configurat pentru emitent"
            : vatCash
              ? "Da"
              : "Nu"}
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-amber-800">
          {error}
        </p>
      )}
      <label className="block text-sm">
        Informații suplimentare
        <textarea
          aria-label="Informații suplimentare factură"
          className="block w-full rounded border p-2"
          maxLength={2000}
          value={draft.extraInfo || ""}
          onChange={(e) => onChange({ extraInfo: e.target.value })}
        />
      </label>
      <details
        open={fiscalOpen}
        onToggle={(e) => setFiscalOpen(e.currentTarget.open)}
      >
        <summary className="cursor-pointer text-sm">
          Date fiscale beneficiar
          {!draft.beneficiary.address ||
          !draft.beneficiary.country ||
          !draft.beneficiary.city
            ? " · de completat"
            : ""}
        </summary>
        <div className="grid gap-3 pt-3 sm:grid-cols-2">
          {Object.entries(fiscalFields).map(([key, label]) => (
            <label key={key} className="text-sm">
              {label}
              <Input
                aria-label={label}
                maxLength={key === "country" ? 2 : 1000}
                value={
                  draft.beneficiary[key as keyof typeof fiscalFields] || ""
                }
                onChange={(e) =>
                  onChange({
                    beneficiary: {
                      ...draft.beneficiary,
                      [key]: e.target.value,
                    },
                  })
                }
              />
            </label>
          ))}
        </div>
      </details>
    </fieldset>
  );
}

export function InvoiceProductFields({
  draft,
  readOnly,
  onChange,
  onBusy,
  approveDiscount,
  onApproveDiscount,
  disabled = false,
}: {
  draft: InvoiceDraft;
  readOnly: boolean;
  onChange: (patch: Partial<InvoiceContent>) => void;
  onBusy: (busy: boolean) => void;
  approveDiscount: boolean;
  disabled?: boolean;
  onApproveDiscount: (value: boolean) => void;
}) {
  const { userData } = useAuth();
  const list = useInvoiceSagaList(draft.workId, !readOnly);
  const [stocks, setStocks] = useState<Record<string, InvoiceStock>>({});
  const stockKey = (line: InvoiceLine) =>
    JSON.stringify([
      line.saga?.snapshot?.code,
      line.saga?.snapshot?.warehouseCode,
    ]);
  let amounts: ReturnType<typeof commercialAmounts> | null = null;
  try {
    amounts = commercialAmounts(draft);
  } catch {
    /* Incomplete edits are shown by the invoice totals. */
  }
  const money = (cents: bigint) =>
    new Intl.NumberFormat("ro-RO", {
      style: "currency",
      currency: "RON",
    }).format(Number(cents) / 100);
  const updateLine = (id: string, patch: Partial<InvoiceLine>) =>
    onChange({
      lines: draft.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    });
  return (
    <div className="space-y-3">
      {draft.lines.map((line, index) => (
        <InvoiceSagaSelection
          key={line.id}
          draft={draft}
          line={line}
          index={index}
          readOnly={readOnly || disabled}
          source={list.source}
          loading={list.loading}
          stock={stocks[stockKey(line)]}
          amount={
            amounts
              ? `Valoare ${money(amounts.bases[index])} · TVA ${money(amounts.vats[index])} · Total ${money(amounts.bases[index] + amounts.vats[index])}`
              : undefined
          }
          onChange={(patch) => updateLine(line.id, patch)}
          onAdd={(selected, stock) => {
            const updated = {
              ...selected,
              id: line.id,
              extraInfo: line.extraInfo || "",
            };
            updateLine(line.id, updated);
            setStocks((previous) => ({
              ...previous,
              [stockKey(updated)]: stock,
            }));
          }}
          onDelete={() =>
            onChange({
              lines: draft.lines.filter((entry) => entry.id !== line.id),
            })
          }
          onStock={(stock) =>
            setStocks((previous) => ({ ...previous, [stockKey(line)]: stock }))
          }
          onBusy={onBusy}
        />
      ))}
      {list.error && (
        <p role="alert" className="text-sm text-red-700">
          {list.error}
        </p>
      )}
      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || draft.lines.length >= 100}
            onClick={() =>
              onChange({
                lines: [
                  ...draft.lines,
                  {
                    id: crypto.randomUUID(),
                    name: "",
                    um: "",
                    quantity: "1",
                    price: "",
                  },
                ],
              })
            }
          >
            Adaugă produs
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || list.loading}
            onClick={list.refresh}
          >
            {list.loading
              ? "Se încarcă lista SAGA…"
              : "Actualizează lista SAGA"}
          </Button>
        </div>
      )}
      {userData?.role === "admin" && !readOnly && (
        <details>
          <summary className="cursor-pointer text-sm">Discount</summary>
          <label className="text-sm">
            Reducere (%)
            <Input
              aria-label="invoice: Reducere (%)"
              disabled={disabled}
              value={draft.discountPercent}
              inputMode="decimal"
              onChange={(e) => onChange({ discountPercent: e.target.value })}
            />
          </label>
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={approveDiscount}
              disabled={disabled}
              onChange={(e) => onApproveDiscount(e.target.checked)}
            />
            Aprob discountul la salvare
          </label>
        </details>
      )}
    </div>
  );
}
