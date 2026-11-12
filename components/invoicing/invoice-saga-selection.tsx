"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { stockInsufficient } from "@/lib/saga/catalog";
import type { InvoiceDraft, InvoiceLine } from "@/lib/invoicing/draft";
import {
  selectSagaRows,
  type SagaSelection,
  type SagaSelectionRow,
} from "@/lib/saga/stock-situation";
import { useCommercialTicketRequest } from "./invoice-commercial";

function LoadingIndicator({ children }: { children: React.ReactNode }) {
  return (
    <span
      role="status"
      className="inline-flex items-center gap-1.5 text-xs text-slate-600"
    >
      <Loader2
        aria-hidden="true"
        className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
      />
      {children}
    </span>
  );
}
export function useInvoiceSagaList(workId: string, enabled: boolean) {
  const { user } = useAuth();
  const actor = useRef(user);
  actor.current = user;
  const [source, setSource] = useState<SagaSelection | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    async function load() {
      try {
        const token = await actor.current?.getIdToken();
        if (disposed) return;
        const response = await fetch(
          `/api/lucrari/${encodeURIComponent(workId)}/invoice-draft/saga-selection`,
          {
            cache: "no-store",
            signal: controller.signal,
            headers: { Authorization: `Bearer ${token || ""}` },
          },
        );
        const result = await response.json();
        if (
          !response.ok ||
          !Array.isArray(result.rows) ||
          typeof result.snapshotId !== "string"
        )
          throw new Error(result.error || "Lista SAGA nu poate fi încărcată.");
        if (!disposed) setSource(result);
      } catch (error) {
        if (!disposed) {
          setError((error as Error).message);
          setSource((previous) =>
            previous ? { ...previous, stale: true } : null,
          );
        }
      } finally {
        if (!disposed) setLoading(false);
      }
    }
    void load();
    return () => {
      disposed = true;
      controller.abort();
    };
  }, [workId, user?.uid, revision, enabled]);
  return {
    source,
    loading,
    error,
    refresh: () => setRevision((value) => value + 1),
  };
}
export type InvoiceStock = { quantity: string; checkedAt: string };
type ArticlePreview = {
  previewId: string;
  article: { name: string; unit: string; vat: string; price: string };
  currencyConfirmed: boolean;
  issues: string[];
  warehouses: { id: string; code: string }[];
};
type Picked = {
  row: SagaSelectionRow;
  preview: ArticlePreview;
  stock: InvoiceStock | null;
};
export function InvoiceSagaSelection({
  draft,
  line,
  index,
  readOnly,
  source,
  loading,
  stock,
  amount,
  onChange,
  onAdd,
  onDelete,
  onStock,
  onBusy,
}: {
  draft: InvoiceDraft;
  line: InvoiceLine;
  index: number;
  readOnly: boolean;
  source: SagaSelection | null;
  loading: boolean;
  stock?: InvoiceStock;
  amount?: string;
  onChange: (patch: Partial<InvoiceLine>) => void;
  onAdd: (line: InvoiceLine, stock: InvoiceStock) => void;
  onDelete: () => void;
  onStock: (stock: InvoiceStock) => void;
  onBusy: (busy: boolean) => void;
}) {
  const request = useCommercialTicketRequest(draft.workId);
  const snapshot = line.saga?.snapshot;
  const [type, setType] = useState(
    snapshot?.typeCode || (snapshot ? snapshot.kind : ""),
  );
  const [warehouse, setWarehouse] = useState(snapshot?.warehouseCode || "");
  const [query, setQuery] = useState(line.name);
  const [offset, setOffset] = useState(0);
  const [phase, setPhase] = useState<"article" | "stock" | "apply" | null>(
    null,
  );
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<Picked | null>(null);
  const [ron, setRon] = useState(false);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  const lock = useRef(false),
    generation = useRef(0);
  const listId = useId();
  const number = index + 1;
  const data = useMemo(
    () =>
      source?.rows
        ? selectSagaRows(source.rows, source, {
            type,
            warehouse,
            q: query,
            offset: String(offset),
          })
        : null,
    [source, type, warehouse, query, offset],
  );
  useEffect(() => {
    setQuery(line.name);
    setType(snapshot?.typeCode || (snapshot ? snapshot.kind : ""));
    setWarehouse(snapshot?.warehouseCode || "");
    setPicked(null);
    setOpen(false);
    generation.current++;
  }, [draft.revision, line.id]);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  function clearSelection(name: string) {
    generation.current++;
    setPicked(null);
    setRon(false);
    setActive(-1);
    setOffset(0);
    setError("");
    onChange({
      name,
      saga: undefined,
      commercial: undefined,
      um: "",
      price: "",
      vatPercent: undefined,
    });
  }
  function otherQuantities(row: SagaSelectionRow) {
    return draft.lines
      .filter(
        (entry) =>
          entry.id !== line.id &&
          entry.saga?.snapshot?.code === row.code &&
          entry.saga.snapshot.warehouseCode === row.warehouseCode,
      )
      .map((entry) => entry.quantity);
  }
  const validQuantity =
    /^\d{1,9}(?:[.,]\d{1,4})?$/.test(line.quantity) &&
    Number(line.quantity.replace(",", ".")) > 0;
  const selectedStock = picked?.stock || stock;
  const quantities = draft.lines
    .filter(
      (entry) =>
        entry.id !== line.id &&
        entry.saga?.snapshot?.code === snapshot?.code &&
        entry.saga?.snapshot?.warehouseCode === snapshot?.warehouseCode,
    )
    .map((entry) => entry.quantity);
  const insufficient = selectedStock
    ? stockInsufficient(selectedStock.quantity, [
        ...(picked ? otherQuantities(picked.row) : quantities),
        line.quantity,
      ])
    : false;
  async function apply(choice: Picked, confirmRON: boolean) {
    setPhase("apply");
    const result = await request("/saga-article/apply", "POST", {
      previewId: choice.preview.previewId,
      warehouseId: choice.preview.warehouses.find(
        (entry) => entry.code === choice.row.warehouseCode,
      )!.id,
      kind: "goods",
      confirmRON,
      quantity: line.quantity,
    });
    onAdd(result.line, choice.stock!);
    setPicked(null);
    setQuery(result.line.name);
    setOpen(false);
  }
  async function choose(row: SagaSelectionRow) {
    if (
      lock.current ||
      readOnly ||
      loading ||
      data?.stale ||
      !data ||
      row.typeCode !== type ||
      row.warehouseCode !== warehouse
    )
      return;
    const requestId = ++generation.current;
    lock.current = true;
    onBusy(true);
    setPhase("article");
    setError("");
    setPicked(null);
    setOpen(false);
    setQuery(row.name);
    try {
      const preview: ArticlePreview = await request(
        "/saga-article/preview",
        "POST",
        {
          code: row.code,
          expectedRevision: draft.revision,
          selection: {
            snapshotId: data.snapshotId,
            typeCode: row.typeCode,
            warehouseCode: row.warehouseCode,
            row,
            selectionProof: row.selectionProof,
          },
        },
      );
      if (requestId !== generation.current) return;
      const warehouseId = preview.warehouses.find(
        (entry) => entry.code === row.warehouseCode,
      )?.id;
      if (!warehouseId)
        throw new Error("Gestiunea necesită verificarea administratorului.");
      setRon(preview.currencyConfirmed);
      setPicked({ row, preview, stock: null });
      if (preview.issues.length) return;
      setPhase("stock");
      const currentStock: InvoiceStock = await request("/stock", "POST", {
        previewId: preview.previewId,
        warehouseId,
        kind: "goods",
      });
      if (requestId !== generation.current) return;
      const choice = { row, preview, stock: currentStock };
      setPicked(choice);
      if (
        preview.currencyConfirmed &&
        validQuantity &&
        !stockInsufficient(currentStock.quantity, [
          ...otherQuantities(row),
          line.quantity,
        ])
      )
        await apply(choice, true);
    } catch (error) {
      if (requestId === generation.current) setError((error as Error).message);
    } finally {
      lock.current = false;
      setPhase(null);
      onBusy(false);
    }
  }
  const busy = !!phase;
  const article = picked?.preview.article;
  const code = picked?.row.code || snapshot?.code || "";
  const unit = article?.unit ?? line.um;
  return (
    <section
      aria-label={`Produs factură ${number}`}
      className="min-w-0 space-y-2 rounded border p-3"
    >
      <fieldset disabled={readOnly || busy} className="min-w-0 space-y-2">
        <legend className="sr-only">Produs factură {number}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="min-w-0 text-sm">
            Tip
            <select
              aria-label="Tip SAGA"
              className="block w-full rounded border bg-white p-2"
              disabled={loading && !data}
              value={type}
              onChange={(event) => {
                clearSelection("");
                setType(event.target.value);
                setWarehouse("");
                setQuery("");
                setOpen(false);
              }}
            >
              <option value="">
                {loading ? "Se încarcă…" : "Selectează tipul"}
              </option>
              {type && !data?.types.some((entry) => entry.code === type) && (
                <option value={type}>
                  {snapshot?.typeName ||
                    (snapshot?.kind === "service"
                      ? "Servicii vândute"
                      : "Marfă")}
                </option>
              )}
              {data?.types.map((entry) => (
                <option key={entry.code} value={entry.code}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0 text-sm">
            Gestiune
            <select
              aria-label="Gestiune SAGA"
              className="block w-full rounded border bg-white p-2"
              disabled={!type || loading}
              value={warehouse}
              onChange={(event) => {
                clearSelection("");
                setWarehouse(event.target.value);
                setQuery("");
                setOpen(false);
              }}
            >
              <option value="">
                {snapshot?.kind === "service"
                  ? "Neaplicabilă"
                  : "Selectează gestiunea"}
              </option>
              {warehouse &&
                !data?.warehouses.some((entry) => entry.code === warehouse) && (
                  <option value={warehouse}>
                    {snapshot?.warehouseName || warehouse}
                  </option>
                )}
              {data?.warehouses.map((entry) => (
                <option key={entry.code} value={entry.code}>
                  {entry.name} · {entry.code}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block min-w-0 text-sm">
          Articol
          <Input
            aria-label={`invoice: Denumire ${number}`}
            role="combobox"
            aria-expanded={open && !loading}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              open && active >= 0 && data?.entries[active]
                ? `${listId}-${active}`
                : undefined
            }
            placeholder="Caută după denumire sau cod"
            disabled={!warehouse || loading}
            value={query}
            onFocus={() => {
              if (!line.saga) setOpen(true);
            }}
            onChange={(event) => {
              clearSelection(event.target.value);
              setQuery(event.target.value);
              setOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setOpen(true);
                setActive((value) =>
                  Math.min(value + 1, (data?.entries.length || 0) - 1),
                );
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((value) => Math.max(0, value - 1));
              }
              if (event.key === "Enter") {
                event.preventDefault();
                const row = data?.entries[Math.max(0, active)];
                if (open && row) void choose(row);
              }
              if (event.key === "Escape") {
                event.stopPropagation();
                setOpen(false);
                setActive(-1);
              }
            }}
          />
        </label>
        {open && !loading && warehouse && (
          <>
            <div
              id={listId}
              role="listbox"
              aria-label="Articole SAGA"
              className="max-h-52 overflow-y-auto rounded border"
            >
              {data?.entries.map((row, position) => (
                <div
                  key={`${row.code}:${row.warehouseCode}`}
                  id={`${listId}-${position}`}
                  role="option"
                  aria-selected={active === position}
                >
                  <button
                    type="button"
                    disabled={data.stale}
                    className={`w-full break-words p-2 text-left text-sm hover:bg-slate-100 ${active === position ? "bg-slate-100" : ""}`}
                    onClick={() => void choose(row)}
                  >
                    {row.name} · {row.code}
                    <span className="block text-xs text-slate-600">
                      Stoc raportat {row.quantity} {row.unit}
                    </span>
                  </button>
                </div>
              ))}
              {!data?.entries.length && (
                <p className="p-2 text-sm">
                  Niciun articol găsit în raportul SAGA.
                </p>
              )}
            </div>
            {(offset > 0 || data?.hasMore) && (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!offset}
                  onClick={() => setOffset((value) => Math.max(0, value - 20))}
                >
                  Anterior
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!data?.hasMore}
                  onClick={() => setOffset((value) => value + 20)}
                >
                  Mai multe articole
                </Button>
              </div>
            )}
          </>
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <label className="min-w-0 text-sm">
            Cod
            <Input
              aria-label={`invoice: Cod ${number}`}
              value={code}
              readOnly
            />
          </label>
          <label className="min-w-0 text-sm">
            UM
            <Input aria-label={`invoice: UM ${number}`} value={unit} readOnly />
          </label>
          <label className="min-w-0 text-sm">
            TVA (%)
            <Input
              aria-label={`TVA linie ${number}`}
              value={article?.vat ?? line.vatPercent ?? ""}
              readOnly
            />
          </label>
          <label className="min-w-0 text-sm">
            Cantitate
            <Input
              aria-label={`invoice: Cantitate ${number}`}
              inputMode="decimal"
              value={line.quantity}
              onChange={(event) => onChange({ quantity: event.target.value })}
            />
          </label>
          <label className="min-w-0 text-sm">
            Preț fără TVA
            <Input
              aria-label={`invoice: Preț unitar ${number}`}
              value={article?.price ?? line.price}
              readOnly
            />
          </label>
        </div>
        <label className="block text-sm">
          Informații suplimentare
          <textarea
            aria-label={`Informații suplimentare linie ${number}`}
            className="block w-full rounded border p-2"
            maxLength={2000}
            value={line.extraInfo || ""}
            onChange={(event) => onChange({ extraInfo: event.target.value })}
          />
        </label>
        {picked && !picked.preview.currencyConfirmed && (
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={ron}
              onChange={(event) => setRon(event.target.checked)}
            />
            Confirm că prețul articolului este în RON
          </label>
        )}
        {picked && (
          <Button
            type="button"
            disabled={
              !ron ||
              !picked.stock ||
              insufficient ||
              !validQuantity ||
              !!picked.preview.issues.length
            }
            onClick={async () => {
              if (lock.current) return;
              lock.current = true;
              onBusy(true);
              setError("");
              try {
                await apply(picked, ron);
              } catch (error) {
                setError((error as Error).message);
              } finally {
                lock.current = false;
                setPhase(null);
                onBusy(false);
              }
            }}
          >
            Confirmă articolul
          </Button>
        )}
        <div className="flex flex-wrap gap-2">
          {line.saga && snapshot?.kind !== "service" && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={async () => {
                if (lock.current) return;
                lock.current = true;
                onBusy(true);
                setPhase("stock");
                setError("");
                try {
                  onStock(await request("/stock", "POST", line.saga));
                } catch (error) {
                  setError((error as Error).message);
                } finally {
                  lock.current = false;
                  setPhase(null);
                  onBusy(false);
                }
              }}
            >
              Actualizează stocul
            </Button>
          )}
          {!readOnly && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`invoice: Șterge poziția ${number}`}
              onClick={onDelete}
            >
              Șterge
            </Button>
          )}
        </div>
      </fieldset>
      {loading && index === 0 && (
        <LoadingIndicator>Se încarcă tipurile…</LoadingIndicator>
      )}
      {phase && (
        <LoadingIndicator>
          {phase === "article"
            ? "Se preiau datele articolului…"
            : phase === "stock"
              ? "Se verifică stocul curent…"
              : "Se completează linia…"}
        </LoadingIndicator>
      )}
      {snapshot?.kind === "service" ? (
        <p className="text-sm">Stoc neaplicabil</p>
      ) : (
        selectedStock && (
          <p className="text-sm">
            Stoc disponibil {selectedStock.quantity} {unit} ·{" "}
            {new Date(selectedStock.checkedAt).toLocaleTimeString("ro-RO")}
          </p>
        )
      )}
      {insufficient && (
        <p role="alert" className="text-sm text-amber-800">
          Stoc insuficient pentru cantitatea cumulată din factură.
        </p>
      )}
      {picked?.preview.issues.map((issue) => (
        <p role="alert" key={issue} className="text-sm text-amber-800">
          {issue}
        </p>
      ))}
      {amount && <p className="text-sm">{amount}</p>}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
