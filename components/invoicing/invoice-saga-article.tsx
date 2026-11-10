"use client";
import { useEffect, useRef, useState } from "react";
import { InvoiceWarehouseSetup } from "./invoice-warehouse-setup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSagaReferenceRequest } from "@/components/settings/saga-references";
import { stockInsufficient, type SagaWarehouse } from "@/lib/saga/catalog";
import type { InvoiceDraft, InvoiceLine } from "@/lib/invoicing/draft";
import { useCommercialTicketRequest } from "./invoice-commercial";

type Preview = {
  fiscalCode: string;
  previewId: string;
  code: string;
  article: { name: string; unit: string; vat: string; price: string };
  checkedAt: string;
  expiresAt: number;
  kind: "goods" | "service" | null;
  currencyConfirmed: boolean;
  issues: string[];
  warehouses: SagaWarehouse[];
};
export function InvoiceCommercialActivation({
  readOnly,
  onActivated,
  onBusy,
}: {
  readOnly: boolean;
  onActivated: () => void;
  onBusy: (v: boolean) => void;
}) {
  const request = useSagaReferenceRequest();
  const [policy, setPolicy] = useState<{
    enabled: boolean;
    revision: number;
    canAdmin: boolean;
    writesEnabled: boolean;
  } | null>(null);
  const [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  useEffect(() => {
    let active = true;
    void request("commercial-policy")
      .then((p) => {
        if (active) setPolicy(p);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  if (policy?.enabled) return null;
  return (
    <section
      aria-label="Activare facturare cu date SAGA"
      className="space-y-2 rounded border p-3 text-sm"
    >
      {error && <p role="alert">{error}</p>}
      {policy &&
        (policy.canAdmin ? (
          <>
            <p>
              Activează o singură dată regulile de facturare SAGA pentru firmă.
              Toate pregătirile noi de XML vor verifica prețul, UM și TVA.
              Ciornele existente cer aplicare explicită; facturile pregătite nu
              se schimbă.
            </p>
            <label className="flex gap-2">
              <input
                type="checkbox"
                disabled={readOnly || !policy.writesEnabled}
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              Confirm activarea regulilor SAGA pentru firma conectată
            </label>
            <Button
              type="button"
              disabled={readOnly || !confirmed || !policy.writesEnabled}
              onClick={async () => {
                if (lock.current) return;
                lock.current = true;
                onBusy(true);
                setError("");
                try {
                  const p = await request("commercial-policy", "PUT", {
                    expectedRevision: policy.revision,
                    confirmed: true,
                  });
                  setPolicy({ ...policy, ...p });
                  onActivated();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  lock.current = false;
                  onBusy(false);
                }
              }}
            >
              Activează facturarea cu date SAGA
            </Button>
          </>
        ) : (
          <p>
            Un administrator trebuie să activeze regulile SAGA pentru firmă
            înainte de adăugarea directă a produselor.
          </p>
        ))}
    </section>
  );
}
export function InvoiceSagaArticle({
  draft,
  readOnly,
  onAdd,
  onBusy,
}: {
  draft: InvoiceDraft;
  readOnly: boolean;
  onAdd: (line: InvoiceLine) => void;
  onBusy?: (v: boolean) => void;
}) {
  const request = useCommercialTicketRequest(draft.workId);
  const [open, setOpen] = useState(false),
    [code, setCode] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [kind, setKind] = useState(""),
    [ron, setRon] = useState(false),
    [warehouseId, setWarehouseId] = useState("");
  const [quantity, setQuantity] = useState("1"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [stock, setStock] = useState<{
      quantity: string;
      checkedAt: string;
    } | null>(null),
    [stockError, setStockError] = useState(""),
    [stockBusy, setStockBusy] = useState(false),
    [retry, setRetry] = useState(0);
  const lock = useRef(false);
  useEffect(() => {
    setPreview(null);
    setStock(null);
    setError("");
  }, [draft.workId, draft.revision]);
  useEffect(() => {
    setStock(null);
    setStockError("");
    setStockBusy(false);
    if (!preview || kind !== "goods" || !warehouseId) return;
    let active = true;
    setStockBusy(true);
    void request("/stock", "POST", {
      previewId: preview.previewId,
      warehouseId,
      kind,
    })
      .then((r) => {
        if (active) setStock(r);
      })
      .catch((e) => {
        if (active) setStockError(e.message);
      })
      .finally(() => {
        if (active) setStockBusy(false);
      });
    return () => {
      active = false;
    };
  }, [preview?.previewId, warehouseId, kind, retry]);
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
  function lookup(preserveQuantity = false) {
    if (readOnly || !code.trim()) return;
    void run(async () => {
      setPreview(null);
      setStock(null);
      const p: Preview = await request("/saga-article/preview", "POST", {
        code,
        expectedRevision: draft.revision,
      });
      setPreview(p);
      setKind(p.kind || "");
      setRon(p.currencyConfirmed);
      setWarehouseId("");
      if (!preserveQuantity) setQuantity("1");
    });
  }
  const warehouse = preview?.warehouses.find((w) => w.id === warehouseId);
  const quantities = draft.lines
    .filter(
      (l) =>
        l.saga?.fiscalCode === preview?.fiscalCode &&
        l.saga?.snapshot?.code === preview?.code &&
        l.saga?.snapshot?.warehouseCode === warehouse?.code,
    )
    .map((l) => l.quantity);
  const insufficient = stock
    ? stockInsufficient(stock.quantity, [...quantities, quantity])
    : false;
  const validQuantity =
    /^\d{1,9}(?:[.,]\d{1,4})?$/.test(quantity) &&
    Number(quantity.replace(",", ".")) > 0;
  return (
    <section
      aria-label="Produs direct din SAGA"
      className="space-y-3 rounded border bg-blue-50 p-3 text-sm"
    >
      <Button
        type="button"
        variant="outline"
        disabled={readOnly || draft.lines.length >= 100}
        onClick={() => setOpen((v) => !v)}
      >
        Adaugă produs din SAGA
      </Button>
      {open &&
        (!draft.commercial ? (
          <p>
            Aplică regulile SAGA din secțiunea de mai sus înainte de preluarea
            produsului. Datele ciornei rămân disponibile pentru comparare.
          </p>
        ) : (
          <div className="space-y-3">
            <label className="block">
              Cod articol SAGA
              <Input
                value={code}
                maxLength={100}
                disabled={readOnly || busy}
                placeholder="Codul exact, inclusiv zerourile"
                onChange={(e) => {
                  setCode(e.target.value);
                  setPreview(null);
                  setStock(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    lookup();
                  }
                }}
              />
            </label>
            <div>
              <Button
                type="button"
                disabled={readOnly || busy || !code.trim()}
                onClick={() => lookup()}
              >
                Preia din SAGA
              </Button>
            </div>
            {preview && (
              <>
                <p className="break-words font-medium">
                  {preview.code} · {preview.article.name}
                </p>
                <p>
                  UM: {preview.article.unit} · TVA:{" "}
                  {preview.article.vat === ""
                    ? "lipsește"
                    : `${preview.article.vat}%`}{" "}
                  · Preț: {preview.article.price || "lipsește"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Citit din SAGA la{" "}
                  {new Date(preview.checkedAt).toLocaleString("ro-RO")}. Prețul,
                  UM și TVA nu pot fi editate aici.
                </p>
                {preview.issues.map((issue) => (
                  <p key={issue} role="alert" className="text-red-700">
                    {issue}
                  </p>
                ))}
                <label className="block">
                  Tip articol
                  <select
                    aria-label="Tip articol direct SAGA"
                    className="block w-full rounded border bg-white p-2"
                    disabled={readOnly || busy || !!preview.kind}
                    value={kind}
                    onChange={(e) => {
                      setKind(e.target.value);
                      setWarehouseId("");
                    }}
                  >
                    <option value="">Alege tipul</option>
                    <option value="goods">Marfă</option>
                    <option value="service">Serviciu</option>
                  </select>
                </label>
                {!preview.currencyConfirmed && (
                  <label className="flex gap-2">
                    <input
                      type="checkbox"
                      checked={ron}
                      disabled={readOnly || busy}
                      onChange={(e) => setRon(e.target.checked)}
                    />
                    Am verificat că prețul acestui articol este în RON
                  </label>
                )}
                {!preview.kind && (
                  <p className="text-xs text-muted-foreground">
                    Tipul și moneda sunt confirmate de operator în FOM, nu
                    furnizate de API.
                  </p>
                )}
                {kind === "goods" && (
                  <>
                    <label className="block">
                      Gestiune
                      <select
                        aria-label="Gestiune produs direct SAGA"
                        className="block w-full rounded border bg-white p-2"
                        disabled={readOnly || busy}
                        value={warehouseId}
                        onChange={(e) => setWarehouseId(e.target.value)}
                      >
                        <option value="">Alege gestiunea</option>
                        {preview.warehouses.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.code} · {w.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {!preview.warehouses.length && (
                      <InvoiceWarehouseSetup
                        readOnly={readOnly || busy}
                        onBusy={onBusy}
                        onSaved={() => {
                          setPreview(null);
                          lookup(true);
                        }}
                      />
                    )}
                  </>
                )}
                {kind === "service" && <p>Stoc neaplicabil · serviciu</p>}
                <label className="block">
                  Cantitate de adăugat
                  <Input
                    value={quantity}
                    inputMode="decimal"
                    disabled={readOnly || busy}
                    onChange={(e) => setQuantity(e.target.value)}
                  />
                </label>
                {stockBusy && <p role="status">Se consultă stocul…</p>}
                {stock && (
                  <p>
                    Stoc: {stock.quantity} {preview.article.unit} · gestiune{" "}
                    {warehouse?.code} ·{" "}
                    {new Date(stock.checkedAt).toLocaleString("ro-RO")}
                  </p>
                )}
                {insufficient && (
                  <p className="text-amber-800">
                    Stoc insuficient pentru cantitatea cumulată a pozițiilor
                    facturii. Adăugarea nu rezervă marfa.
                  </p>
                )}
                {stockError && (
                  <div>
                    <p role="alert">Stoc neconfirmat: {stockError}</p>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={readOnly || busy}
                      onClick={() => setRetry((v) => v + 1)}
                    >
                      Reîncearcă citirea stocului
                    </Button>
                  </div>
                )}
                <Button
                  type="button"
                  disabled={
                    readOnly ||
                    busy ||
                    stockBusy ||
                    !kind ||
                    !ron ||
                    !validQuantity ||
                    preview.issues.length > 0 ||
                    (kind === "goods" && !warehouseId)
                  }
                  onClick={() =>
                    run(async () => {
                      const r = await request("/saga-article/apply", "POST", {
                        previewId: preview.previewId,
                        quantity,
                        warehouseId: kind === "goods" ? warehouseId : "",
                        kind,
                        confirmRON: ron,
                      });
                      onAdd(r.line);
                      setOpen(false);
                      setPreview(null);
                      setCode("");
                      setStock(null);
                    })
                  }
                >
                  Adaugă în factură
                </Button>
                <p className="text-xs text-muted-foreground">
                  Asocierea se păstrează în FOM. Ciorna trebuie salvată; nu se
                  emite factura și nu se scade marfă prin această adăugare.
                </p>
              </>
            )}
            {error && (
              <p role="alert" className="text-red-700">
                {error}
              </p>
            )}
          </div>
        ))}
    </section>
  );
}
