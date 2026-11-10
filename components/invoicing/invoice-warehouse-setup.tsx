"use client";
import { useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function InvoiceWarehouseSetup({
  readOnly,
  onBusy,
  onSaved,
}: {
  readOnly: boolean;
  onBusy?: (v: boolean) => void;
  onSaved: () => void;
}) {
  const { user, userData } = useAuth();
  const [code, setCode] = useState(""),
    [name, setName] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const lock = useRef(false);
  if (userData?.role !== "admin")
    return (
      <p>
        Nu există gestiuni active permise. Un administrator poate configura
        gestiunea necesară aici.
      </p>
    );
  async function save() {
    if (lock.current || readOnly) return;
    lock.current = true;
    setBusy(true);
    onBusy?.(true);
    setError("");
    let saved = false;
    try {
      const token = await user?.getIdToken();
      const r = await fetch("/api/integrations/saga/catalog/warehouses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token || ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ expectedRevision: 0, code, name, active: true }),
      });
      const data = await r.json();
      if (!r.ok) throw Error(data.error || "Gestiunea nu poate fi salvată.");
      saved = true;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
      onBusy?.(false);
    }
    if (saved) onSaved();
  }
  return (
    <fieldset
      disabled={readOnly || busy}
      className="space-y-2 rounded border p-3"
      aria-label="Gestiune lipsă"
    >
      <p>
        Configurează o singură dată gestiunea din SAGA. Se salvează doar în FOM;
        nu extinde gestiunile permise produselor existente.
      </p>
      <label className="block">
        Cod gestiune SAGA
        <Input
          aria-label="Cod gestiune nouă"
          value={code}
          maxLength={100}
          onChange={(e) => {
            setCode(e.target.value);
            setConfirmed(false);
          }}
        />
      </label>
      <label className="block">
        Denumire gestiune
        <Input
          aria-label="Denumire gestiune nouă"
          value={name}
          maxLength={300}
          onChange={(e) => {
            setName(e.target.value);
            setConfirmed(false);
          }}
        />
      </label>
      <label className="flex gap-2">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        Confirm codul și denumirea gestiunii din SAGA.
      </label>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <Button
        type="button"
        className="h-auto max-w-full whitespace-normal"
        disabled={!confirmed || !code.trim() || !name.trim()}
        onClick={() => void save()}
      >
        {busy ? "Se salvează…" : "Salvează gestiunea în FOM"}
      </Button>
    </fieldset>
  );
}
