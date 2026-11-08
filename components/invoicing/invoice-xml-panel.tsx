"use client";
import { InvoiceSagaPanel } from "./invoice-saga-panel";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import type { PreparedInvoice, XmlPreview } from "@/lib/invoicing/xml";
const money = (v: number) =>
  new Intl.NumberFormat("ro-RO", { style: "currency", currency: "RON" }).format(
    v / 100,
  );
export function InvoiceXmlPanel({
  workId,
  revision,
  dirty,
  readOnly,
  onPrepared,
  onFrozen,
  onBusy,
}: {
  workId: string;
  revision: number;
  dirty: boolean;
  readOnly: boolean;
  onPrepared: () => Promise<unknown>;
  onFrozen: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const { user } = useAuth();
  const [doc, setDoc] = useState<PreparedInvoice | null>(null),
    [preview, setPreview] = useState<XmlPreview | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const lock = useRef(false),
    operation = useRef<string | null>(null);
  async function request(suffix = "", method = "GET", body?: unknown) {
    const token = await user?.getIdToken();
    const r = await fetch(
      `/api/lucrari/${encodeURIComponent(workId)}/invoice-xml${suffix}`,
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
    const data = await r.json();
    if (!r.ok)
      throw new Error(data.error || "Documentul nu poate fi pregătit.");
    return data;
  }
  useEffect(() => {
    let active = true;
    void request()
      .then((data) => {
        if (active && data.document) {
          setDoc(data.document);
          if (!readOnly) onFrozen();
        }
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      });
    return () => {
      active = false;
    };
  }, [workId, user?.uid, readOnly]);
  useEffect(() => {
    setPreview(null);
    operation.current = null;
  }, [revision, dirty, user?.uid]);
  async function inspect() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      const data = await request("/preview", "POST", {
        expectedRevision: revision,
      });
      if (data.document) {
        setDoc(data.document);
        await onPrepared();
      } else {
        setPreview(data);
        operation.current = crypto.randomUUID();
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
    if (!preview || lock.current) return;
    lock.current = true;
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      const data = await request("", "POST", {
        expectedRevision: revision,
        previewHash: preview.previewHash,
        operationId: operation.current,
      });
      setDoc(data.document);
      setPreview(null);
      await onPrepared();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
      onBusy(false);
    }
  }
  async function download() {
    if (!doc || lock.current) return;
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
      if (!r.ok) {
        const data = await r.json();
        throw new Error(data.error || "Descărcare indisponibilă.");
      }
      const url = URL.createObjectURL(await r.blob()),
        a = document.createElement("a");
      a.href = url;
      a.download = doc.filename;
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
  return (
    <section
      aria-label="Pregătire XML"
      className="space-y-3 rounded-lg border bg-slate-50 p-3 text-sm"
    >
      <h4 className="font-semibold">Document XML pentru SAGA</h4>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {doc ? (
        <>
          <p role="status" className="font-medium">
            Document XML pregătit în FOM
          </p>
          <p className="break-words">Număr: {doc.number}</p>
          {doc.snapshot.numbering && (
            <p>
              Utilizator emitent: {doc.snapshot.numbering.name} · Serie:{" "}
              {doc.snapshot.numbering.prefix}
            </p>
          )}
          <p>
            Compatibilitate SAGA neverificată · stoc neverificat la pregătire
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void download()}
          >
            Descarcă XML
          </Button>
          <InvoiceSagaPanel
            workId={workId}
            sha256={doc.sha256}
            onBusy={onBusy}
          />
        </>
      ) : (
        <>
          <p>
            Pregătirea rezervă un număr în FOM și blochează editarea ciornei.
            Documentul nu este transmis către SAGA.
          </p>
          {dirty && (
            <p className="text-amber-800">
              Salvează modificările ciornei înainte de pregătire.
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={busy || dirty || readOnly || revision < 1}
            onClick={() => void inspect()}
          >
            Pregătește XML
          </Button>
        </>
      )}
      {preview && !doc && (
        <div
          role="group"
          aria-label="Confirmare XML"
          className="space-y-2 rounded border bg-white p-3"
        >
          <p className="font-medium">
            Verifică documentul înainte de rezervarea numărului
          </p>
          {preview.snapshot.numbering && (
            <p>
              Utilizator emitent: {preview.snapshot.numbering.name} · Serie:{" "}
              {preview.snapshot.numbering.prefix}
            </p>
          )}
          <p>
            Emitent: {preview.snapshot.issuer.name} ·{" "}
            {preview.snapshot.issuer.cui}
          </p>
          <p>
            Beneficiar: {preview.snapshot.content.beneficiary.name} ·{" "}
            {preview.snapshot.content.beneficiary.cui || "CUI lipsă confirmat"}
          </p>
          <div className="space-y-1 break-words text-xs">
            <p>
              Adresă emitent:{" "}
              {[
                preview.snapshot.issuer.address,
                preview.snapshot.issuer.city,
                preview.snapshot.issuer.county,
                preview.snapshot.issuer.country,
              ]
                .filter(Boolean)
                .join(", ")}
            </p>
            <p>
              Registru emitent: {preview.snapshot.issuer.registration} · TVA la
              încasare:{" "}
              {preview.snapshot.issuer.vatCashAccounting ? "Da" : "Nu"}
            </p>
            <p>
              Bancă / IBAN emitent:{" "}
              {[preview.snapshot.issuer.bank, preview.snapshot.issuer.iban]
                .filter(Boolean)
                .join(" · ") || "necompletate"}
            </p>
            <p>
              Adresă beneficiar:{" "}
              {[
                preview.snapshot.content.beneficiary.address,
                preview.snapshot.content.beneficiary.city,
                preview.snapshot.content.beneficiary.county,
                preview.snapshot.content.beneficiary.country,
              ]
                .filter(Boolean)
                .join(", ")}
            </p>
            <p>
              Registru beneficiar:{" "}
              {preview.snapshot.content.beneficiary.registration ||
                "necompletat"}{" "}
              · cod SAGA: {preview.snapshot.clientCode}
            </p>
            <p>
              Data: {preview.snapshot.content.date} · Scadență:{" "}
              {preview.snapshot.content.dueDate || "necompletată"}
            </p>
          </div>
          {preview.snapshot.agent && (
            <p>
              Agent SAGA: {preview.snapshot.agent.code} —{" "}
              {preview.snapshot.agent.name}
            </p>
          )}
          <p>Număr estimat — nerezervat: {preview.estimatedNumber}</p>
          <div className="space-y-1">
            {preview.snapshot.lines.map((l, i) => (
              <p key={l.id} className="break-words">
                {i + 1}. {l.code} · {l.name} · {l.quantity} {l.unit} ·{" "}
                {money(l.baseCents)} + TVA {money(l.vatCents)}
                {l.warehouseCode
                  ? ` · gestiune ${l.warehouseCode}`
                  : " · serviciu"}
              </p>
            ))}
          </div>
          <p>
            Valoare: {money(preview.snapshot.totals.subtotalCents)} · Reducere{" "}
            {preview.snapshot.content.discountPercent}%:{" "}
            {money(preview.snapshot.totals.discountCents)} · TVA{" "}
            {preview.snapshot.content.vatPercent}%:{" "}
            {money(preview.snapshot.totals.vatCents)}
          </p>
          <p>Total: {money(preview.snapshot.totals.totalCents)}</p>
          <p>
            Compatibilitate SAGA neverificată. Confirmarea rezervă definitiv
            numărul în FOM și îngheață documentul.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={busy || dirty || readOnly}
              onClick={() => void confirm()}
            >
              Confirmă pregătirea XML
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setPreview(null)}
            >
              Renunță la pregătire
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
