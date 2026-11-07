"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import {
  stockInsufficient,
  unitsMatch,
  type SagaCatalog,
  type InvoiceSagaLink,
} from "@/lib/saga/catalog";
import type { InvoiceLine } from "@/lib/invoicing/draft";
import type { SagaReadResult } from "@/lib/saga/contracts";

export function InvoiceSagaFields({
  line,
  lines,
  catalog,
  workId,
  readOnly,
  onChange,
  index,
}: {
  line: InvoiceLine;
  lines: InvoiceLine[];
  catalog: SagaCatalog | null;
  workId: string;
  readOnly: boolean;
  onChange: (saga?: InvoiceSagaLink) => void;
  index: number;
}) {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [result, setResult] = useState<
    (SagaReadResult & { association: InvoiceSagaLink }) | null
  >(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const product = catalog?.products.find((p) => p.id === line.saga?.productId);
  const snapshot = line.saga?.snapshot;
  const currentWarehouse = catalog?.warehouses.find(
    (w) => w.id === line.saga?.warehouseId,
  );
  const mismatch =
    !!line.saga &&
    !!catalog &&
    (!product?.active ||
      product.revision !== line.saga.revision ||
      catalog.fiscalCode !== line.saga.fiscalCode ||
      (!!line.saga.warehouseId &&
        (!currentWarehouse?.active ||
          !product?.warehouseIds.includes(line.saga.warehouseId) ||
          (line.saga.warehouseRevision !== undefined &&
            currentWarehouse.revision !== line.saga.warehouseRevision))));
  const unit = product?.unit || snapshot?.unit || "";
  const service = (product?.kind || snapshot?.kind) === "service";
  function select(productId: string, warehouseId = "") {
    const p = catalog?.products.find((p) => p.id === productId);
    const w = catalog?.warehouses.find((w) => w.id === warehouseId);
    onChange(
      p && catalog
        ? {
            fiscalCode: catalog.fiscalCode,
            productId: p.id,
            revision: p.revision,
            warehouseId,
            ...(w ? { warehouseRevision: w.revision } : {}),
            snapshot: {
              code: p.code,
              name: p.articleName,
              unit: p.unit,
              kind: p.kind,
              warehouseCode: w?.code || "",
              warehouseName: w?.name || "",
            },
          }
        : undefined,
    );
  }
  async function check() {
    if (lock.current || !line.saga) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const token = await user?.getIdToken();
      const r = await fetch(
        `/api/lucrari/${encodeURIComponent(workId)}/invoice-draft/stock`,
        {
          method: "POST",
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${token || ""}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(line.saga),
        },
      );
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Consultarea stocului a eșuat.");
      setResult(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const quantities = lines
    .filter(
      (l) =>
        l.saga?.fiscalCode === line.saga?.fiscalCode &&
        l.saga?.productId === line.saga?.productId &&
        l.saga?.revision === line.saga?.revision &&
        l.saga?.warehouseId === line.saga?.warehouseId,
    )
    .map((l) => l.quantity);
  const insufficient =
    result?.quantity !== undefined
      ? stockInsufficient(result.quantity, quantities)
      : null;
  const choices = catalog?.products.filter(
    (p) =>
      p.active &&
      (!search ||
        `${p.code} ${p.name} ${p.articleName}`
          .toLocaleLowerCase("ro")
          .includes(search.toLocaleLowerCase("ro"))),
  );
  return (
    <div
      role="region"
      className="mt-3 space-y-2 rounded border bg-slate-50 p-3 text-sm"
      aria-label={`Asociere SAGA poziția ${index + 1}`}
    >
      {!readOnly && catalog && (
        <>
          <label className="block">
            Caută articol asociat
            <Input
              aria-label={`Caută articol SAGA ${index + 1}`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className="block">
            Articol SAGA
            <select
              aria-label={`Articol SAGA ${index + 1}`}
              className="mt-1 block w-full min-w-0 rounded border bg-white p-2"
              value={line.saga?.productId || ""}
              onChange={(e) => select(e.target.value)}
            >
              <option value="">Fără asociere</option>
              {line.saga &&
                !choices?.some((p) => p.id === line.saga!.productId) && (
                  <option value={line.saga.productId}>
                    {snapshot?.code || product?.code || line.saga.productId} ·{" "}
                    {snapshot?.name || product?.name || "Asociere salvată"}
                  </option>
                )}
              {choices?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.name} · {p.unit}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      {!line.saga ? (
        <p className="text-amber-800">
          Produs neasociat cu SAGA. Ciorna poate fi salvată.
        </p>
      ) : (
        <>
          {!readOnly && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onChange(undefined)}
            >
              Elimină asocierea SAGA
            </Button>
          )}
          <p className="break-words">
            SAGA: {product?.code || snapshot?.code || line.saga.productId} ·{" "}
            {product?.articleName || snapshot?.name} · {unit}
          </p>
          {mismatch && (
            <p role="alert" className="text-amber-800">
              Asociere modificată sau inactivă. Selectează din nou un produs
              activ ori elimină asocierea.
            </p>
          )}
          {mismatch && !readOnly && product?.active && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => select(product.id)}
            >
              Preia asocierea actualizată
            </Button>
          )}
          {!unitsMatch(line.um, unit) && (
            <p className="text-amber-800">
              UM incompatibilă: în ciornă „{line.um || "lipsește"}”, în SAGA „
              {unit}”. Nu efectuăm conversii automate.
            </p>
          )}
          {service ? (
            <p>Stoc neaplicabil · serviciu</p>
          ) : (
            <>
              {!readOnly && catalog && (
                <label className="block">
                  Gestiune
                  <select
                    aria-label={`Gestiune SAGA ${index + 1}`}
                    className="mt-1 block w-full rounded border bg-white p-2"
                    value={line.saga.warehouseId}
                    onChange={(e) =>
                      select(line.saga!.productId, e.target.value)
                    }
                  >
                    <option value="">Alege gestiunea</option>
                    {line.saga.warehouseId &&
                      !catalog.warehouses.some(
                        (w) =>
                          w.id === line.saga!.warehouseId &&
                          w.active &&
                          product?.warehouseIds.includes(w.id),
                      ) && (
                        <option value={line.saga.warehouseId}>
                          {snapshot?.warehouseCode || "Gestiune indisponibilă"}
                        </option>
                      )}
                    {catalog.warehouses
                      .filter(
                        (w) => w.active && product?.warehouseIds.includes(w.id),
                      )
                      .map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.code} · {w.name}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              {readOnly && (
                <p>
                  Gestiune: {snapshot?.warehouseCode || "lipsește"}{" "}
                  {snapshot?.warehouseName}
                </p>
              )}
              {!readOnly && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={
                    busy ||
                    mismatch ||
                    !catalog ||
                    !line.saga.warehouseId ||
                    !catalog.warehouses.some(
                      (w) =>
                        w.id === line.saga!.warehouseId &&
                        w.active &&
                        product?.warehouseIds.includes(w.id),
                    )
                  }
                  onClick={() => void check()}
                >
                  {busy ? "Se consultă…" : "Verifică stocul"}
                </Button>
              )}
              {result && (
                <div role="status">
                  <p>
                    Stoc: {result.quantity} {result.association.snapshot?.unit}{" "}
                    · gestiune {result.warehouse} ·{" "}
                    {new Date(result.checkedAt).toLocaleString("ro-RO", {
                      timeZone: "Europe/Bucharest",
                    })}
                  </p>
                  {insufficient === true && (
                    <p className="text-amber-800">
                      Stoc insuficient pentru cantitatea cumulată a pozițiilor
                      acestui articol și acestei gestiuni.
                    </p>
                  )}
                  {insufficient === null && (
                    <p className="text-amber-800">
                      Completează cantitățile pentru compararea cu stocul.
                    </p>
                  )}
                  {quantities.length > 1 && (
                    <p>
                      {quantities.length} poziții incluse în verificarea
                      cantității cumulate.
                    </p>
                  )}
                  <p className="text-xs text-slate-500">
                    Consultarea nu rezervă marfa.
                  </p>
                </div>
              )}
              {error && (
                <p role="alert" className="text-red-700">
                  {error}
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
