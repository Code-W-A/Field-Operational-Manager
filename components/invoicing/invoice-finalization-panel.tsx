"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import type { InvoiceDraft } from "@/lib/invoicing/draft";
import type { PreparedInvoice, InvoiceXmlSnapshot } from "@/lib/invoicing/xml";
import type { StockGroup } from "@/lib/invoicing/saga-transfer";
import { eurReferenceText } from "@/lib/invoicing/eur-rate";
import { InvoiceSagaPanel } from "./invoice-saga-panel";

type Mode = "dry-run" | "test" | "production";
type Summary = {
  previewId: string;
  mode: Mode;
  expiresAt: number;
  canConfirm: boolean;
  issues: string[];
  groups: StockGroup[];
  snapshot: InvoiceXmlSnapshot;
  estimatedNumber: string;
  prepared: boolean;
};
type State = {
  mode: Mode;
  canStart: boolean;
  reason: string;
  transfer: { phase: string; importStatus: string } | null;
};
const money = (cents: number) =>
  new Intl.NumberFormat("ro-RO", { style: "currency", currency: "RON" }).format(
    cents / 100,
  );

export function InvoiceFinalizationPanel({
  workId,
  draft,
  dirty,
  readOnly,
  onSaveBeforePreview,
  onPrepared,
  onFrozen,
  onBusy,
}: {
  workId: string;
  draft: InvoiceDraft;
  dirty: boolean;
  readOnly: boolean;
  onSaveBeforePreview: () => Promise<InvoiceDraft | undefined>;
  onPrepared: () => Promise<unknown>;
  onFrozen: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const { user } = useAuth();
  const [doc, setDoc] = useState<PreparedInvoice | null>(null);
  const [state, setState] = useState<State | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const summaryElement = useRef<HTMLDivElement>(null);
  const startButton = useRef<HTMLButtonElement>(null);
  const lock = useRef(false),
    operation = useRef("");
  const callbacks = useRef({ onFrozen, onPrepared });
  callbacks.current = { onFrozen, onPrepared };
  async function request(path: string, body?: unknown) {
    const token = await user?.getIdToken();
    const r = await fetch(
      `/api/lucrari/${encodeURIComponent(workId)}/${path}`,
      {
        method: body ? "POST" : "GET",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${token || ""}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      },
    );
    const data = await r.json();
    if (!r.ok)
      throw Object.assign(
        new Error(
          data.error ||
            "Operațiunea nu este disponibilă. Editările sunt păstrate.",
        ),
        { status: r.status },
      );
    return data;
  }
  useEffect(() => {
    let active = true;
    void Promise.all([request("invoice-xml"), request("invoice-saga")])
      .then(([prepared, status]) => {
        if (!active) return;
        setDoc(prepared.document);
        setState(status);
        if (prepared.document) {
          callbacks.current.onFrozen();
          if (status.transfer) setSummary(null);
        }
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      });
    return () => {
      active = false;
    };
  }, [workId, user?.uid, refresh]);
  // Editing after the summary requires another save and source/stock check.
  useEffect(() => {
    setSummary(null);
    operation.current = "";
  }, [dirty, draft.revision, user?.uid]);
  useEffect(() => {
    summaryElement.current?.focus();
  }, [summary?.previewId]);
  async function inspect() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      const saved = doc ? draft : await onSaveBeforePreview();
      if (!saved) return; // Parent preserves local edits and displays the save conflict.
      const result = await request("invoice-finalization/preview", {
        expectedRevision: saved.revision,
      });
      if (result.alreadyStarted) {
        setDoc(result.document);
        setRefresh((v) => v + 1);
        if (result.document) await callbacks.current.onPrepared();
      } else {
        operation.current = crypto.randomUUID();
        setSummary(result);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
      onBusy(false);
    }
  }
  async function confirm() {
    if (!summary || lock.current) return;
    lock.current = true;
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      const result = await request("invoice-finalization", {
        previewId: summary.previewId,
        operationId: operation.current,
      });
      setDoc(result.document);
      setSummary(null);
      setRefresh((v) => v + 1);
      callbacks.current.onFrozen();
      await callbacks.current.onPrepared();
    } catch (e) {
      const conflict = (e as { status?: number }).status === 409;
      if (conflict) setSummary(null);
      setError(
        `${(e as Error).message} ${conflict ? "Reia verificarea facturii." : "Verifică progresul; reîncercarea nu alocă alt număr."}`,
      );
      setRefresh((v) => v + 1); // Recover a committed document even when the response was lost.
    } finally {
      lock.current = false;
      setBusy(false);
      onBusy(false);
    }
  }
  async function download() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      const token = await user?.getIdToken();
      const r = await fetch(
        `/api/lucrari/${encodeURIComponent(workId)}/invoice-xml/download`,
        {
          cache: "no-store",
          headers: { Authorization: `Bearer ${token || ""}` },
        },
      );
      if (!r.ok) throw new Error("Documentul nu poate fi descărcat.");
      const url = URL.createObjectURL(await r.blob()),
        a = document.createElement("a");
      a.href = url;
      a.download = doc!.filename;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
      onBusy(false);
    }
  }
  const sim = (summary?.mode || state?.mode) === "dry-run";
  const canInspect =
    state &&
    (!state.transfer ||
      (state.transfer.phase === "blocked" &&
        state.transfer.importStatus === "pending"));
  return (
    <section
      aria-label="Emiterea facturii"
      className="min-w-0 break-words space-y-3 rounded-lg border border-blue-200 bg-blue-50/40 p-3 text-sm"
    >
      <h4 className="font-semibold">Emitere factură</h4>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {!state && !error && <p>Se verifică starea facturii…</p>}
      {!state && error && (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setError("");
            setRefresh((v) => v + 1);
          }}
        >
          Reîncearcă verificarea
        </Button>
      )}
      {state && !state.canStart && (
        <p className="text-amber-800">{state.reason}</p>
      )}
      {doc && (
        <p>
          Document pregătit în FOM: <strong>{doc.number}</strong>. Numărul și
          valorile sunt păstrate.
        </p>
      )}
      {!summary && canInspect && (
        <Button
          type="button"
          disabled={busy || (!doc && readOnly) || !state?.canStart}
          ref={startButton}
          className="h-auto max-w-full whitespace-normal py-2"
          onClick={() => void inspect()}
        >
          {busy
            ? "Se verifică factura…"
            : sim
              ? "Simulează emiterea și trimiterea"
              : "Emite și trimite în SAGA"}
        </Button>
      )}
      {summary && (
        <div
          ref={summaryElement}
          tabIndex={-1}
          role="group"
          aria-label="Confirmare emitere și trimitere"
          className="space-y-3 rounded border bg-white p-3"
        >
          <h5 className="font-semibold">Verifică factura</h5>
          <p>
            Client: <strong>{summary.snapshot.content.beneficiary.name}</strong>{" "}
            · cod SAGA {summary.snapshot.clientCode}
          </p>
          <p>
            CUI/CIF:{" "}
            {summary.snapshot.content.beneficiary.cui || "lipsă confirmată"} ·{" "}
            {summary.snapshot.content.beneficiary.address}
          </p>
          <p>
            Firmă emitentă: {summary.snapshot.issuer.name} ·{" "}
            {summary.snapshot.issuer.cui}
          </p>
          {summary.snapshot.agent && (
            <p>
              Agent SAGA: {summary.snapshot.agent.code} ·{" "}
              {summary.snapshot.agent.name}
            </p>
          )}
          {summary.snapshot.eurReference && (
            <p>{eurReferenceText(summary.snapshot.eurReference)}</p>
          )}
          <p>
            Operator emitent:{" "}
            {summary.snapshot.numbering?.name || doc?.preparedBy || user?.uid} ·
            serie:{" "}
            {summary.snapshot.numbering?.prefix ||
              summary.estimatedNumber.replace(/\d+$/, "")}
          </p>
          <p>
            {summary.prepared
              ? "Număr deja rezervat"
              : "Număr estimat — nerezervat"}
            : <strong>{summary.estimatedNumber}</strong>
          </p>
          <p>
            Data: {summary.snapshot.content.date} · Scadență:{" "}
            {summary.snapshot.content.dueDate || "—"}
          </p>
          <ul className="space-y-2">
            {summary.snapshot.lines.map((line) => (
              <li key={line.id} className="break-words rounded border p-2">
                <strong>{line.name}</strong> · {line.code} · {line.quantity}{" "}
                {line.unit} · {money(line.baseCents + line.vatCents)}
                {line.kind === "goods" ? (
                  <p>Gestiune: {line.warehouseCode}</p>
                ) : (
                  <p>Serviciu — stoc neaplicabil</p>
                )}
              </li>
            ))}
          </ul>
          {summary.mode === "dry-run" ? (
            <p className="text-amber-800">
              Simulare — netransmis. Nu consultăm stocul SAGA. Confirmarea
              rezervă un număr în FOM și pregătește documentul pentru simulare.
            </p>
          ) : (
            <>
              {summary.groups.map((g) => (
                <p key={JSON.stringify([g.code, g.warehouse])}>
                  {g.code} · gestiune {g.warehouse}: necesar cumulat{" "}
                  {g.expected} {g.unit}; disponibil{" "}
                  {g.before
                    ? `${g.before.quantity} ${g.unit} (${new Date(g.before.checkedAt).toLocaleString("ro-RO")})`
                    : "necunoscut"}
                </p>
              ))}
              <p>
                Stocul va fi recitit înainte de import. Această verificare nu
                rezervă marfă.
              </p>
            </>
          )}
          <p className="text-lg font-semibold">
            Total: {money(summary.snapshot.totals.totalCents)}
          </p>
          {summary.issues.map((issue) => (
            <p key={issue} role="alert" className="text-red-700">
              {issue}
            </p>
          ))}
          <p className="text-xs text-slate-600">
            {summary.prepared
              ? "Folosim documentul existent, fără renumerotare."
              : "La confirmare se rezervă numărul și documentul nu mai poate fi editat."}{" "}
            Importul și diferența de stoc sunt raportate separat.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={busy || !summary.canConfirm}
              className="h-auto max-w-full whitespace-normal py-2"
              onClick={() => void confirm()}
            >
              {sim
                ? "Confirmă simularea emiterii și trimiterii"
                : "Confirmă emiterea și trimiterea"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setSummary(null);
                operation.current = "";
                requestAnimationFrame(() => startButton.current?.focus());
              }}
            >
              Înapoi la ciornă
            </Button>
          </div>
        </div>
      )}
      {doc && (
        <>
          <InvoiceSagaPanel
            workId={workId}
            sha256={doc.sha256}
            onBusy={onBusy}
            allowStart={false}
            refreshKey={refresh}
            onStatus={setState}
          />
          <details>
            <summary className="cursor-pointer">Detaliile documentului</summary>
            <div className="mt-2 space-y-2 break-words">
              <p>Compatibilitate SAGA neverificată · XML înghețat</p>
              <p>
                Pregătit de {doc.preparedBy} la{" "}
                {new Date(doc.preparedAt).toLocaleString("ro-RO")}
              </p>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void download()}
              >
                Descarcă XML
              </Button>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
