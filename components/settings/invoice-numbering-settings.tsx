"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import {
  formatInvoiceNumber,
  nextInvoiceNumber,
  parseLastNumber,
  type NumberingInput,
  type NumberingPreview,
  type NumberingState,
} from "@/lib/invoicing/numbering";
const empty = (): NumberingInput => ({
  expectedRevision: 0,
  prefix: "",
  lastVerifiedNumber: "",
  reason: "",
  exclusiveConfirmed: false,
  sagaVerified: false,
});
export function InvoiceNumberingSettings() {
  const { user } = useAuth();
  const [data, setData] = useState<NumberingState | null>(null),
    [form, setForm] = useState<NumberingInput>(empty),
    [preview, setPreview] = useState<NumberingPreview | null>(null);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const lock = useRef(false);
  async function request(path = "", method = "GET", body?: unknown) {
    const token = await user?.getIdToken();
    const r = await fetch(`/api/integrations/saga/numbering${path}`, {
      method,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token || ""}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const value = await r.json();
    if (!r.ok) throw new Error(value.error || "Numerotare indisponibilă.");
    return value;
  }
  async function reload() {
    setError("");
    try {
      const value = await request();
      if (typeof value.fiscalCode !== "string" || !("estimatedNumber" in value))
        throw new Error("Numerotare indisponibilă.");
      setData(value);
      setForm({
        ...empty(),
        expectedRevision: value.config?.revision || 0,
        prefix: value.config?.prefix || "",
        lastVerifiedNumber: value.counter
          ? value.counter.lastNumber.padStart(value.counter.width, "0")
          : "",
      });
      setPreview(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void reload();
  }, [user?.uid]);
  function patch(v: Partial<NumberingInput>) {
    setForm((f) => ({ ...f, ...v }));
    setPreview(null);
    setNotice("");
  }
  async function prepare() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      setPreview(await request("/preview", "POST", form));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function confirm() {
    if (!preview || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await request("", "PUT", {
        ...preview.input,
        confirmationHash: preview.confirmationHash,
      });
      await reload();
      setNotice("Numerotare salvată în FOM.");
    } catch (e) {
      setError((e as Error).message);
      setPreview(null);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    const changed = () => void reload();
    window.addEventListener("invoice-numbering-changed", changed);
    return () =>
      window.removeEventListener("invoice-numbering-changed", changed);
  }, [user?.uid]);
  if (data?.mode === "per_user")
    return (
      <section
        aria-label="Numerotare facturi"
        className="rounded border p-4 text-sm"
      >
        <h3 className="font-semibold">Numerotare pe utilizator activă</h3>
        <p>
          Seria se alege automat după utilizator. Administrarea se face în
          Numerotare pe utilizator; configurația generală este păstrată pentru
          istoric.
        </p>
      </section>
    );
  let next = "";
  try {
    const p = parseLastNumber(form.lastVerifiedNumber);
    next = formatInvoiceNumber(
      form.prefix,
      nextInvoiceNumber(p.number),
      data?.counter?.allocationCount ? data.counter.width : p.width,
    );
  } catch {
    /* incomplete form */
  }
  return (
    <section
      aria-label="Numerotare facturi"
      className="space-y-3 rounded-lg border p-4"
    >
      <h3 className="font-semibold">Numerotare facturi</h3>
      <p className="text-sm text-muted-foreground">
        Confirmă ultimul număr verificat în SAGA. Seria va fi folosită exclusiv
        de FOM; următoarele numere sunt gestionate aici. Configurarea nu
        contactează SAGA.
      </p>
      {data && <p className="text-sm">Firma SAGA: {data.fiscalCode}</p>}
      {data?.estimatedNumber && (
        <p className="break-words text-sm">
          Următorul număr estimat: <strong>{data.estimatedNumber}</strong> ·{" "}
          {data.counter?.allocationCount || 0} numere alocate
        </p>
      )}
      {data?.config && (
        <p className="text-xs text-muted-foreground">
          Ultima valoare verificată de admin:{" "}
          {formatInvoiceNumber(
            data.config.prefix,
            data.config.verifiedLast,
            data.config.width,
          )}{" "}
          ·{" "}
          {new Date(data.config.verifiedAt).toLocaleString("ro-RO", {
            timeZone: "Europe/Bucharest",
          })}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-emerald-800">
          {notice}
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => void reload()}
      >
        Reîncarcă numerotarea
      </Button>
      <fieldset disabled={busy || !data} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Serie / prefix factură
            <Input
              maxLength={32}
              value={form.prefix}
              readOnly={data?.config?.hasAllocated}
              onChange={(e) => patch({ prefix: e.target.value })}
            />
          </label>
          <label className="text-sm">
            Ultimul număr verificat în SAGA (doar cifre)
            <Input
              inputMode="numeric"
              maxLength={18}
              value={form.lastVerifiedNumber}
              onChange={(e) => patch({ lastVerifiedNumber: e.target.value })}
            />
          </label>
        </div>
        {data?.config?.hasAllocated && (
          <p className="text-sm">
            După prima alocare, seria și lungimea minimă a numărului sunt fixe.
            Contorul poate fi corectat doar înainte.
          </p>
        )}
        {data?.config && (
          <label className="block text-sm">
            Motivul corecției
            <Input
              maxLength={500}
              value={form.reason}
              onChange={(e) => patch({ reason: e.target.value })}
            />
          </label>
        )}
        {next && (
          <p className="break-words text-sm">
            Previzualizare: {form.prefix}
            {form.lastVerifiedNumber} → <strong>{next}</strong>
          </p>
        )}
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.sagaVerified}
            onChange={(e) => patch({ sagaVerified: e.target.checked })}
          />
          Confirm că am verificat ultimul număr în SAGA.
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.exclusiveConfirmed}
            onChange={(e) => patch({ exclusiveConfirmed: e.target.checked })}
          />
          Confirm că această serie nu mai este folosită independent în SAGA sau
          în alte aplicații.
        </label>
        <Button type="button" variant="outline" onClick={() => void prepare()}>
          Pregătește numerotarea
        </Button>
      </fieldset>
      {preview && (
        <div
          role="group"
          aria-label="Confirmare numerotare"
          className="space-y-2 rounded border bg-slate-50 p-3 text-sm"
        >
          <p className="break-words">
            Valoare curentă: {preview.previousNumber || "Neconfigurată"}.
            Următorul număr după confirmare:{" "}
            <strong>{preview.nextNumber}</strong>.
          </p>
          {preview.input.reason && <p>Motiv: {preview.input.reason}</p>}
          {!data?.writesEnabled && (
            <p>Numerotarea nu este activată pentru salvare.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={busy || !data?.writesEnabled}
              onClick={() => void confirm()}
            >
              Confirmă și salvează numerotarea
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setPreview(null)}
            >
              Anulează confirmarea
            </Button>
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Nu există resetare automată la schimbarea anului. Salvarea ciornelor nu
        consumă numere.
      </p>
    </section>
  );
}
