"use client";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  invoiceContent,
  type InvoiceDraft,
  type InvoiceContent,
  type InvoiceLine,
} from "@/lib/invoicing/draft";
import { useSagaReferenceRequest } from "@/components/settings/saga-references";
import type { ReferenceEntry } from "@/lib/saga/references";
import type { SagaProduct } from "@/lib/saga/catalog";
import type { CommercialLineSource } from "@/lib/invoicing/commercial";
export function useCommercialTicketRequest(workId: string) {
  const { user } = useAuth();
  return async (path: string, method = "GET", body?: unknown) => {
    const token = await user?.getIdToken();
    const r = await fetch(
      `/api/lucrari/${encodeURIComponent(workId)}/invoice-draft${path}`,
      {
        method,
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${token || ""}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      },
    );
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Date comerciale indisponibile.");
    return d;
  };
}
export function InvoiceCommercialApply({
  draft,
  readOnly,
  onApplied,
  onBusy,
}: {
  draft: InvoiceDraft;
  readOnly: boolean;
  onApplied: () => Promise<unknown>;
  onBusy?: (busy: boolean) => void;
}) {
  const request = useCommercialTicketRequest(draft.workId),
    [preview, setPreview] = useState<{
      content: InvoiceContent;
      confirmationHash: string;
      issues: string[];
    } | null>(null),
    [replaceBeneficiary, setReplaceBeneficiary] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const lock = useRef(false);
  async function run(fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    onBusy?.(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
      onBusy?.(false);
    }
  }
  useEffect(
    () => setPreview(null),
    [draft.revision, JSON.stringify(invoiceContent(draft))],
  );
  return (
    <section
      className="space-y-2 rounded border bg-amber-50 p-3 text-sm"
      aria-label="Aplicare reguli SAGA"
    >
      <p>
        {draft.commercial
          ? "Actualizarea regulilor recitește datele salvate în FOM și cere confirmarea diferențelor."
          : "Regulile comerciale SAGA sunt active. Aplică-le explicit înainte de pregătirea XML."}
      </p>
      <label className="block">
        <input
          type="checkbox"
          disabled={readOnly || busy}
          checked={replaceBeneficiary}
          onChange={(e) => {
            setReplaceBeneficiary(e.target.checked);
            setPreview(null);
          }}
        />{" "}
        Propune și datele beneficiarului din clientul FOM, pentru comparare
      </label>
      <Button
        type="button"
        variant="outline"
        disabled={readOnly || busy}
        onClick={() =>
          run(async () =>
            setPreview(
              await request("/commercial-preview", "POST", {
                expectedRevision: draft.revision,
                content: invoiceContent(draft),
                applyBeneficiary: replaceBeneficiary,
              }),
            ),
          )
        }
      >
        {draft.commercial
          ? "Actualizează regulile SAGA"
          : "Aplică regulile SAGA"}
      </Button>
      {preview && (
        <div
          role="group"
          aria-label="Confirmare reguli SAGA"
          className="space-y-2 rounded border bg-white p-2"
        >
          <p>
            Beneficiar: {draft.beneficiary.name} / {draft.beneficiary.cui} /{" "}
            {draft.beneficiary.address} → {preview.content.beneficiary.name} /{" "}
            {preview.content.beneficiary.cui} /{" "}
            {preview.content.beneficiary.address}
          </p>
          {Object.entries(preview.content.beneficiary)
            .filter(
              ([key, value]) =>
                String(value || "") !==
                String((draft.beneficiary as any)[key] || ""),
            )
            .map(([key, value]) => (
              <p key={key}>
                {(
                  {
                    name: "Denumire",
                    cui: "CUI/CIF",
                    registration: "Registrul comerțului",
                    address: "Adresă",
                    bank: "Bancă",
                    iban: "IBAN",
                    phone: "Telefon",
                    email: "Email",
                    country: "Țară",
                    county: "Județ",
                    city: "Localitate",
                  } as Record<string, string>
                )[key] || "Date beneficiar"}
                : {String((draft.beneficiary as any)[key] || "lipsă")} →{" "}
                {String(value || "lipsă")}
              </p>
            ))}
          <p>
            Scadență: {draft.dueDate || "lipsă"} →{" "}
            {preview.content.dueDate || "de completat manual"}
          </p>
          {preview.content.lines.map((l, i) => (
            <p key={l.id}>
              {l.name}: UM {draft.lines[i]?.um || "lipsă"} → {l.um || "lipsă"} ·
              preț {draft.lines[i]?.price || "lipsă"} → {l.price || "lipsă"} ·
              TVA {l.vatPercent || "lipsă"}%
            </p>
          ))}
          {preview.issues.map((issue) => (
            <p key={issue}>{issue}</p>
          ))}
          <p>
            Confirmarea salvează ciorna în FOM. Nu rezervă număr și nu transmite
            în SAGA.
          </p>
          <Button
            type="button"
            disabled={busy || readOnly}
            onClick={() =>
              run(async () => {
                await request("", "PUT", {
                  expectedRevision: draft.revision,
                  content: preview.content,
                  commercialHash: preview.confirmationHash,
                });
                await onApplied();
                setPreview(null);
              })
            }
          >
            Confirmă și salvează regulile SAGA
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => setPreview(null)}
          >
            Renunță la aplicare
          </Button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
type Choice = {
  entry: ReferenceEntry;
  product: SagaProduct | null;
  source: CommercialLineSource | null;
  issues: string[];
};
export function InvoiceCommercialSelector({
  line,
  index,
  readOnly,
  onChange,
}: {
  line: InvoiceLine;
  index: number;
  readOnly: boolean;
  onChange: (line: InvoiceLine) => void;
}) {
  const request = useSagaReferenceRequest(),
    [fiscalCode, setFiscalCode] = useState(""),
    [q, setQ] = useState(""),
    [field, setField] = useState("code"),
    [entries, setEntries] = useState<Choice[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [search, setSearch] = useState({ q: "", field: "code" }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const results = useRef<HTMLDivElement>(null);
  async function load(next = false) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams(
        next ? { ...search, cursor: cursor || "" } : { q, field },
      );
      const d = await request("commercial-products?" + params);
      setEntries(d.entries);
      setFiscalCode(d.fiscalCode);
      setCursor(d.nextCursor);
      if (!next) setSearch({ q, field });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (readOnly)
    return (
      <p className="text-xs">
        Sursă comercială: {line.commercial?.checkedAt || "neconfirmată"}
      </p>
    );
  return (
    <div
      className="space-y-2 text-sm"
      aria-label={`Selector comercial ${index + 1}`}
    >
      <div className="grid gap-2 sm:grid-cols-[auto_1fr_auto]">
        <select
          aria-label={`Căutare comercială după ${index + 1}`}
          className="min-w-0 rounded border p-2"
          value={field}
          onChange={(e) => setField(e.target.value)}
        >
          <option value="code">Început cod</option>
          <option value="name">Început denumire</option>
        </select>
        <Input
          aria-label={`Caută referință articol ${index + 1}`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void load();
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              results.current
                ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
                ?.focus();
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => load()}
        >
          Caută în referințe
        </Button>
      </div>
      <div
        ref={results}
        className="space-y-2"
        onKeyDown={(e) => {
          if (!["ArrowDown", "ArrowUp"].includes(e.key)) return;
          const buttons = Array.from(
              results.current?.querySelectorAll<HTMLButtonElement>(
                "button:not(:disabled)",
              ) || [],
            ),
            i = buttons.indexOf(document.activeElement as HTMLButtonElement);
          if (i >= 0) {
            e.preventDefault();
            buttons[
              (i + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) %
                buttons.length
            ]?.focus();
          }
        }}
      >
        {entries.map((c) => (
          <div
            key={c.entry.id}
            className="rounded border p-2 [overflow-wrap:anywhere]"
          >
            <p>
              {c.entry.code} — {c.entry.name} · tip{" "}
              {String(c.entry.exportData.typeCode || "neprecizat")} · UM{" "}
              {c.entry.apiSnapshot?.unit || "lipsă"} · TVA{" "}
              {c.entry.apiSnapshot?.vat ?? "lipsă"} · preț{" "}
              {c.entry.apiSnapshot?.price ?? "lipsă"} ·{" "}
              {c.entry.apiSnapshot?.checkedAt || "neverificat API"}
            </p>
            {c.issues.map((issue) => (
              <p key={issue}>{issue}</p>
            ))}
            <Button
              type="button"
              variant="outline"
              disabled={!c.product || !c.source || !!c.issues.length}
              onClick={() => {
                const p = c.product!,
                  a = c.entry.apiSnapshot!;
                onChange({
                  ...line,
                  name: line.name || p.name,
                  um: a.unit,
                  price: a.price!,
                  vatPercent: a.vat!,
                  commercial: c.source!,
                  saga: {
                    fiscalCode,
                    productId: p.id,
                    revision: p.revision,
                    warehouseId: "",
                    snapshot: {
                      code: p.code,
                      name: p.articleName,
                      unit: p.unit,
                      kind: p.kind,
                      warehouseCode: "",
                      warehouseName: "",
                    },
                  },
                });
                setEntries([]);
              }}
            >
              Alege {c.entry.code}
            </Button>
          </div>
        ))}
      </div>
      {cursor && (
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => load(true)}
        >
          Următoarele articole
        </Button>
      )}
      {line.commercial && (
        <p>
          Verificat API: {line.commercial.checkedAt} · preț/UM/TVA protejate
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
