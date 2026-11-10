"use client";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  IMPORT_LABELS,
  STOCK_LABELS,
  STOCK_UNCONFIRMED,
  transferPending,
  type SagaTransfer,
} from "@/lib/invoicing/saga-transfer";
type PublicTransfer = Omit<
  SagaTransfer,
  "leaseOwner" | "leaseUntil" | "actorRole"
>;
type State = {
  mode: "dry-run" | "test" | "production";
  canStart: boolean;
  reason: string;
  transfer: PublicTransfer | null;
};
export function InvoiceSagaPanel({
  workId,
  sha256,
  onBusy,
  allowStart = true,
  refreshKey = 0,
  onStatus,
}: {
  workId: string;
  sha256: string;
  onBusy: (busy: boolean) => void;
  allowStart?: boolean;
  refreshKey?: number;
  onStatus?: (state: State) => void;
}) {
  const { user } = useAuth();
  const [state, setState] = useState<State | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false);
  const lock = useRef(false);
  const statusCallback = useRef(onStatus);
  statusCallback.current = onStatus;
  const pending =
    !!state?.transfer && transferPending(state.transfer as SagaTransfer);
  async function request(suffix = "", method = "GET", body?: unknown) {
    const token = await user?.getIdToken();
    const r = await fetch(
      `/api/lucrari/${encodeURIComponent(workId)}/invoice-saga${suffix}`,
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
    if (suffix === "/report") {
      if (!r.ok) throw new Error("Raportul nu poate fi descărcat.");
      return r;
    }
    const data = await r.json();
    if (!r.ok)
      throw new Error(data.error || "Operațiunea SAGA nu este disponibilă.");
    return data;
  }
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function load() {
      try {
        const data = await request();
        if (!active) return;
        setState(data);
        statusCallback.current?.(data);
        setError("");
        if (data.transfer && transferPending(data.transfer))
          timer = setTimeout(() => void load(), 2000);
      } catch (e) {
        if (active) {
          setError((e as Error).message);
          timer = setTimeout(() => void load(), 5000);
        }
      }
    }
    void load();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [workId, user?.uid, pending, refreshKey]);
  async function act(kind: "start" | "recheck" | "report") {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      if (kind === "report") {
        const r = (await request("/report")) as Response,
          url = URL.createObjectURL(await r.blob()),
          a = document.createElement("a");
        a.href = url;
        a.download = "raport-import-saga.txt";
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        const data = await request(
          kind === "recheck" ? "/recheck" : "",
          "POST",
          kind === "start" ? { sha256, operationId: crypto.randomUUID() } : {},
        );
        setState((s) => (s ? { ...s, ...data } : data));
        setConfirm(false);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
      onBusy(false);
    }
  }
  const t = state?.transfer,
    sim = (state?.transfer?.mode || state?.mode) === "dry-run";
  return (
    <section
      aria-label="Transmitere și stoc SAGA"
      className="min-w-0 break-words space-y-3 rounded-lg border border-blue-200 bg-white p-3 text-sm"
    >
      <h4 className="font-semibold">Transmitere factură și stoc SAGA</h4>
      {sim && (
        <p className="font-medium text-amber-800">
          Simulare — netransmis. Cantitățile și rezultatele de mai jos sunt
          simulate.
        </p>
      )}
      {(state?.transfer?.mode || state?.mode) === "test" && (
        <p className="font-medium">Mod firmă SAGA de test</p>
      )}
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {!state && <p>Se citește starea operațiunii…</p>}
      {state && !state.canStart && (
        <p className="text-amber-800">{state.reason}</p>
      )}
      {state && !t && <p>Import factură: Netrimisă</p>}
      {t && (
        <>
          <dl className="space-y-1">
            <div>
              <dt className="inline font-medium">Import factură: </dt>
              <dd className="inline">
                {sim ? "Simulare: " : ""}
                {IMPORT_LABELS[t.importStatus]}
              </dd>
            </div>
            <div>
              <dt className="inline font-medium">Verificare stoc: </dt>
              <dd className="inline">
                {sim ? "Simulare: " : ""}
                {STOCK_LABELS[t.stockStatus]}
              </dd>
            </div>
          </dl>
          {t.error && <p className="break-words text-amber-800">{t.error}</p>}
          {t.importStatus === "imported" &&
            ["checking", "not_confirmed"].includes(t.stockStatus) && (
              <p className="text-amber-800">
                {sim ? "Simulare: " : ""}
                {STOCK_UNCONFIRMED}
              </p>
            )}
          {!!t.groups.length && (
            <details>
              <summary className="cursor-pointer">
                Citiri și diferențe de stoc
              </summary>
              <div className="mt-2 space-y-2">
                {t.groups.map((g) => (
                  <div
                    key={JSON.stringify([g.code, g.warehouse])}
                    className="break-words rounded border p-2"
                  >
                    <p>
                      {g.code} · gestiune {g.warehouse} · {g.expected} {g.unit}{" "}
                      pe factură
                    </p>
                    <p>
                      Înainte:{" "}
                      {g.before
                        ? `${g.before.quantity} ${g.unit} (${new Date(g.before.checkedAt).toLocaleString("ro-RO")})`
                        : "necitit"}
                    </p>
                    <p>
                      După:{" "}
                      {g.after
                        ? `${g.after.quantity} ${g.unit} (${new Date(g.after.checkedAt).toLocaleString("ro-RO")})`
                        : "neconfirmat"}{" "}
                      · Diferență: {g.delta ?? "—"}
                    </p>
                  </div>
                ))}
              </div>
            </details>
          )}
          {t.stockStatus === "observed" && (
            <p className="text-xs text-slate-600">
              Diferența observată nu dovedește singură validarea contabilă sau
              atribuirea mișcării acestei facturi; pot exista alte operațiuni în
              SAGA.
            </p>
          )}
          {pending && (
            <p role="status">
              Procesare pe server. Poți închide editorul; operațiunea continuă
              independent.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {t.reportAvailable && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                className="h-auto max-w-full whitespace-normal py-2 text-left"
                onClick={() => void act("report")}
              >
                Descarcă raportul importului
              </Button>
            )}
            {!pending &&
              t.importStatus !== "pending" &&
              t.importStatus !== "sending" &&
              t.groups.length > 0 &&
              t.groups.every((g) => g.before) && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy || !state?.canStart}
                  className="h-auto max-w-full whitespace-normal py-2 text-left"
                  onClick={() => void act("recheck")}
                >
                  Reverifică stocul (fără retrimitere)
                </Button>
              )}
          </div>
        </>
      )}
      {allowStart &&
        state &&
        (!t || (t.phase === "blocked" && t.importStatus === "pending")) && (
          <Button
            type="button"
            variant="outline"
            disabled={busy || !state.canStart}
            onClick={() => setConfirm(true)}
          >
            {t
              ? "Reia verificarea înainte de trimitere"
              : sim
                ? "Simulează trimiterea în SAGA"
                : "Finalizează și trimite în SAGA"}
          </Button>
        )}
      {confirm && (
        <div
          role="group"
          aria-label="Confirmare trimitere SAGA"
          className="space-y-2 rounded border bg-blue-50 p-3"
        >
          <p>
            {sim
              ? "Confirmi simularea locală? Nu se apelează SAGA."
              : "Confirmi trimiterea facturii deja numerotate? Stocul se citește înainte de import, iar XML-ul existent este transmis o singură dată."}
          </p>
          <p>
            Un rezultat incert necesită reconciliere; factura nu va fi retrimisă
            automat.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={busy}
              onClick={() => void act("start")}
            >
              {sim ? "Confirmă simularea" : "Confirmă trimiterea în SAGA"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setConfirm(false)}
            >
              Anulează trimiterea
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
