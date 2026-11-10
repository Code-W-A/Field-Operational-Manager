"use client";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  issuerLabels,
  type InvoiceIssuer,
  type IssuerProfile,
} from "@/lib/invoicing/xml";
const empty = (): InvoiceIssuer =>
  ({
    ...Object.fromEntries(Object.keys(issuerLabels).map((k) => [k, ""])),
    vatCashAccounting: false,
  }) as InvoiceIssuer;
export function InvoiceIssuerSettings({
  inline = false,
  canEdit = true,
  readOnly = false,
  onBusy,
}: {
  inline?: boolean;
  canEdit?: boolean;
  readOnly?: boolean;
  onBusy?: (v: boolean) => void;
} = {}) {
  const { user } = useAuth();
  const [form, setForm] = useState<InvoiceIssuer>(empty),
    [saved, setSaved] = useState<IssuerProfile | null>(null),
    [enabled, setEnabled] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [confirmed, setConfirmed] = useState(false);
  const lock = useRef(false);
  const [loaded, setLoaded] = useState(false);
  async function request(method = "GET", body?: unknown) {
    const token = await user?.getIdToken();
    const r = await fetch("/api/integrations/saga/issuer", {
      method,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token || ""}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Profil indisponibil.");
    return data;
  }
  async function load() {
    setError("");
    try {
      const data = await request();
      if (typeof data.fiscalCode !== "string")
        throw new Error("Profil indisponibil.");
      setSaved(data.profile);
      setEnabled(data.writesEnabled);
      setForm(data.profile || empty());
      setConfirmed(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoaded(true);
    }
  }
  useEffect(() => {
    void load();
  }, [user?.uid]);
  async function save() {
    if (lock.current || !confirmed || !canEdit || readOnly) return;
    lock.current = true;
    setBusy(true);
    onBusy?.(true);
    setError("");
    try {
      const data = await request("PUT", {
        expectedRevision: saved?.revision || 0,
        profile: form,
      });
      setSaved(data.profile);
      setForm(data.profile);
      setConfirmed(false);
      setNotice("Profilul firmei emitente a fost salvat în FOM.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      onBusy?.(false);
      lock.current = false;
    }
  }
  if (inline && (!loaded || saved)) return null;
  if (inline && !canEdit)
    return (
      <p className="rounded border border-amber-300 p-3 text-sm">
        Lipsesc datele fiscale ale firmei emitente. Un administrator le poate
        completa aici, în editor.
      </p>
    );
  return (
    <section
      aria-label="Firma emitentă"
      className="space-y-3 rounded-lg border p-4"
    >
      <h3 className="font-semibold">Firma emitentă</h3>
      <p className="text-sm text-muted-foreground">
        Date fiscale pentru XML. Completează și confirmă datele reale ale
        firmei, inclusiv opțiunea TVA la încasare.
      </p>
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
        onClick={() => void load()}
      >
        Reîncarcă profilul emitentului
      </Button>
      <fieldset disabled={busy || readOnly} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          {Object.entries(issuerLabels).map(([k, label]) => (
            <label key={k} className="text-sm">
              {label}
              <Input
                maxLength={1000}
                value={form[k as keyof typeof issuerLabels]}
                onChange={(e) => {
                  setForm((f) => ({
                    ...f,
                    [k]:
                      k === "country" || k === "county"
                        ? e.target.value.toUpperCase()
                        : e.target.value,
                  }));
                  setConfirmed(false);
                  setNotice("");
                }}
              />
            </label>
          ))}
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.vatCashAccounting}
            onChange={(e) => {
              setForm((f) => ({ ...f, vatCashAccounting: e.target.checked }));
              setConfirmed(false);
            }}
          />
          Firma aplică TVA la încasare
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          Confirm datele fiscale și opțiunea TVA la încasare pentru firma
          emitentă.
        </label>
        <Button
          type="button"
          disabled={!enabled || !confirmed}
          onClick={() => void save()}
        >
          Salvează firma emitentă
        </Button>
        {!enabled && (
          <p className="text-sm text-muted-foreground">
            Salvarea nu este activată pentru acest mediu.
          </p>
        )}
      </fieldset>
    </section>
  );
}
