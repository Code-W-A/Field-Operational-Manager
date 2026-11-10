"use client";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  normalizeTaxId,
  type ClientAssociation,
  type SagaClientEntry,
} from "@/lib/saga/clients";
export function SagaClientAssociation({
  clientId,
  canEdit,
}: {
  clientId: string;
  canEdit: boolean;
}) {
  const { user } = useAuth();
  const [data, setData] = useState<ClientAssociation | null>(null),
    [entries, setEntries] = useState<SagaClientEntry[]>([]);
  const [country, setCountry] = useState(""),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState<SagaClientEntry | null>(null);
  const [editing, setEditing] = useState(false),
    [missing, setMissing] = useState(false),
    [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [manualMode, setManualMode] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualTaxId, setManualTaxId] = useState("");
  const [manualConfirmed, setManualConfirmed] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  function startManual() {
    setManualMode(true);
    setManualCode(query.trim());
    setManualName(data?.clientName || "");
    setManualTaxId(data?.taxId || "");
    setCountry(country || "RO");
    setManualConfirmed(false);
    setError("");
    setNotice("");
  }
  const lock = useRef(false);
  const saving = useRef(false);
  const session = useRef(0);
  function changeOpen(open: boolean) {
    if (saving.current) return;
    session.current++;
    setEditing(open);
    setManualMode(false);
    setManualConfirmed(false);
    setHasSearched(false);
    setCountry(data?.link?.country || "");
    setQuery("");
    setSelected(null);
    setEntries([]);
    setMissing(false);
    setRemoving(false);
    setError("");
    if (open) setNotice("");
  }
  async function request(url: string, method = "GET", body?: unknown) {
    const token = await user?.getIdToken();
    const r = await fetch(url, {
      method,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token || ""}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await r.json();
    if (!r.ok) throw new Error(result.error || "Asociere indisponibilă.");
    return result;
  }
  async function reload() {
    setError("");
    try {
      const result = await request(
        `/api/clienti/${encodeURIComponent(clientId)}/saga-link`,
      );
      setData(result);
      setCountry(result.link?.country || "");
      setSelected(null);
      setMissing(false);
      setManualConfirmed(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void reload();
    session.current++;
    setEditing(false);
    setEntries([]);
  }, [clientId, user?.uid]);
  async function search(byTax = false) {
    if (lock.current) return;
    const searchSession = session.current;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const q = byTax ? normalizeTaxId(data?.taxId || "", country) : query;
      if (byTax && (!country || !q))
        throw new Error(
          "Completează țara și verifică existența CUI-ului în FOM.",
        );
      const result = await request(
        `/api/integrations/saga/clients?${new URLSearchParams({ q, country, ...(byTax ? { mode: "tax" } : {}) })}`,
      );
      if (searchSession !== session.current) return;
      if (result.runningImport)
        throw new Error(
          "Lista se actualizează. Așteaptă finalizarea importului.",
        );
      setHasSearched(true);
      setEntries(
        byTax
          ? result.entries.filter(
              (entry: SagaClientEntry) =>
                normalizeTaxId(entry.taxId, entry.country) === q,
            )
          : result.entries,
      );
      setSelected(null);
      setMissing(false);
      setNotice(
        result.total > 100 ? "Sunt multe rezultate. Restrânge căutarea." : "",
      );
    } catch (e) {
      if (searchSession === session.current) setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function save(remove = false) {
    if (
      !canEdit ||
      !data ||
      lock.current ||
      (!remove && (manualMode ? !manualConfirmed : !selected))
    )
      return;
    saving.current = true;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await request(
        `/api/clienti/${encodeURIComponent(clientId)}/saga-link`,
        "PUT",
        {
          expectedRevision: data.revision,
          ...(remove
            ? { sagaClientId: null }
            : manualMode
              ? {
                  manualClient: {
                    code: manualCode,
                    name: manualName,
                    taxId: manualTaxId,
                    country,
                  },
                  manualConfirmed,
                }
              : {
                  sagaClientId: selected!.id,
                  sagaRevision: selected?.revision,
                }),
          country,
          missingTaxConfirmed:
            manualMode && !remove ? manualConfirmed : missing,
        },
      );
      setData(result);
      setCountry(result.link?.country || "");
      setEditing(false);
      setRemoving(false);
      setSelected(null);
      setNotice(remove ? "Asociere eliminată." : "Asociere salvată în FOM.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      saving.current = false;
      lock.current = false;
      setBusy(false);
    }
  }
  const needsMissing =
    selected &&
    (!normalizeTaxId(data?.taxId || "", country) ||
      !normalizeTaxId(selected.taxId, selected.country));
  return (
    <Sheet open={editing} onOpenChange={changeOpen}>
      <section
        aria-label="Asociere client SAGA"
        className="space-y-2 rounded-lg border bg-card p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h3 className="font-semibold">Asociere SAGA</h3>
            <p className="break-words text-sm text-muted-foreground">
              {data?.entry ? (
                <>
                  Client SAGA asociat:{" "}
                  <strong>
                    {data.entry.code} · {data.entry.name}
                  </strong>
                </>
              ) : data ? (
                "Neasociat"
              ) : (
                "Asociere indisponibilă momentan"
              )}
            </p>
          </div>
          <SheetTrigger asChild>
            <Button type="button" size="sm" variant="outline">
              {canEdit
                ? data?.link
                  ? "Reasociază clientul SAGA"
                  : "Asociază clientul SAGA"
                : "Vezi asocierea"}
            </Button>
          </SheetTrigger>
        </div>
        {!editing && error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        {!editing && notice && (
          <p role="status" className="text-sm text-emerald-800">
            {notice}
          </p>
        )}
        {data?.issues.map((issue) => (
          <p key={issue} className="text-sm text-amber-800">
            {issue}
          </p>
        ))}
      </section>
      <SheetContent
        side="right"
        className="h-full w-full overflow-y-auto sm:max-w-[540px]"
        aria-busy={busy}
      >
        <SheetHeader>
          <SheetTitle>
            {canEdit
              ? data?.link
                ? "Reasociază clientul SAGA"
                : "Asociază clientul SAGA"
              : "Asociere SAGA"}
          </SheetTitle>
          <SheetDescription>
            Alege clientul din listă sau introdu codul lui din SAGA. Asocierea
            se salvează doar în FOM.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          {data && (
            <p className="text-xs text-muted-foreground">
              Firma SAGA: {data.fiscalCode}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="text-sm text-muted-foreground">
              {notice}
            </p>
          )}
          {data?.entry && (
            <div className="space-y-1 break-words rounded border p-3 text-sm">
              <p>
                Client SAGA asociat:{" "}
                <strong>
                  {data.entry.code} · {data.entry.name}
                </strong>
              </p>
              <p>
                CUI/CIF: {data.entry.taxId || "lipsește"} · Țară:{" "}
                {data.entry.country}
              </p>
              {data.link?.confirmationMethod === "manual" && (
                <p>
                  Confirmat manual de{" "}
                  {data.link.confirmedByName || data.link.updatedBy}, la{" "}
                  {new Date(data.link.updatedAt).toLocaleString("ro-RO", {
                    timeZone: "Europe/Bucharest",
                  })}
                  . Neverificat online.
                </p>
              )}
              <p>
                Sursă: {data.entry.source} · confirmat la{" "}
                {new Date(data.link!.updatedAt).toLocaleString("ro-RO", {
                  timeZone: "Europe/Bucharest",
                })}
              </p>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void reload()}
            >
              Reîncarcă asocierea
            </Button>
            {canEdit && data?.link && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => setRemoving(true)}
              >
                Elimină asocierea
              </Button>
            )}
          </div>
          {removing && canEdit && (
            <div className="space-y-2 rounded border p-3">
              <p className="text-sm">
                Confirmi eliminarea legăturii acestui client cu SAGA?
              </p>
              <Button
                type="button"
                disabled={busy}
                onClick={() => void save(true)}
              >
                Confirmă eliminarea
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setRemoving(false)}
              >
                Păstrează asocierea
              </Button>
            </div>
          )}
          {!removing && canEdit && data && (
            <div className="flex flex-wrap gap-2" aria-label="Mod de asociere">
              <Button
                type="button"
                size="sm"
                disabled={busy}
                variant={manualMode ? "outline" : "default"}
                aria-pressed={!manualMode}
                onClick={() => {
                  setManualMode(false);
                  setError("");
                }}
              >
                Caută în listă
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={busy}
                variant={manualMode ? "default" : "outline"}
                aria-pressed={manualMode}
                onClick={startManual}
              >
                Asociază prin cod SAGA
              </Button>
            </div>
          )}
          {!removing && canEdit && data && manualMode && (
            <fieldset disabled={busy} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Deschide clientul în SAGA, copiază codul și verifică datele de
                mai jos. Nu ai nevoie de export.
              </p>
              <label className="block text-sm">
                Cod client SAGA
                <Input
                  autoFocus
                  value={manualCode}
                  placeholder="Exemplu: 00973"
                  maxLength={100}
                  onChange={(e) => {
                    setManualCode(e.target.value);
                    setManualConfirmed(false);
                  }}
                />
              </label>
              <label className="block text-sm">
                Denumirea clientului în SAGA
                <Input
                  value={manualName}
                  maxLength={300}
                  onChange={(e) => {
                    setManualName(e.target.value);
                    setManualConfirmed(false);
                  }}
                />
              </label>
              <label className="block text-sm">
                CUI/CIF al clientului în SAGA
                <Input
                  value={manualTaxId}
                  maxLength={100}
                  onChange={(e) => {
                    setManualTaxId(e.target.value);
                    setManualConfirmed(false);
                  }}
                />
              </label>
              <label className="block text-sm">
                Țara fiscală
                <Input
                  value={country}
                  maxLength={2}
                  onChange={(e) => {
                    setCountry(e.target.value.toUpperCase());
                    setManualConfirmed(false);
                  }}
                />
              </label>
              <p className="text-xs text-muted-foreground">
                Datele sunt precompletate din FOM. Confirmarea este făcută de
                tine, fără verificare online în SAGA.
              </p>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={manualConfirmed}
                  onChange={(e) => setManualConfirmed(e.target.checked)}
                />
                <span>
                  Am verificat în SAGA codul, denumirea și CUI-ul acestui
                  client.
                  {(!normalizeTaxId(data.taxId, country) ||
                    !normalizeTaxId(manualTaxId, country)) &&
                    " Confirm identitatea clientului chiar dacă lipsește CUI-ul într-una dintre surse."}
                </span>
              </label>
              <Button
                type="button"
                disabled={
                  !manualConfirmed ||
                  !manualCode.trim() ||
                  !manualName.trim() ||
                  !/^[A-Z]{2}$/.test(country)
                }
                onClick={() => void save()}
              >
                Salvează asocierea
              </Button>
            </fieldset>
          )}
          {!removing && canEdit && data && !manualMode && (
            <fieldset disabled={busy} className="space-y-3">
              <label className="block text-sm">
                Țara fiscală a clientului FOM (confirmare)
                <Input
                  maxLength={2}
                  value={country}
                  placeholder="Exemplu: RO"
                  onChange={(e) => {
                    setCountry(e.target.value.toUpperCase());
                    setEntries([]);
                    setSelected(null);
                  }}
                />
              </label>
              <p className="text-sm">
                CUI/CIF în FOM: {data?.taxId || "lipsește"}
              </p>
              <label className="block text-sm">
                Caută client SAGA după cod, denumire sau CUI
                <Input
                  value={query}
                  maxLength={100}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void search()}
                >
                  Caută în lista importată
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void search(true)}
                >
                  Propune după CUI
                </Button>
              </div>
              {entries.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {hasSearched
                    ? "Nu am găsit clientul în lista FOM. Poți folosi «Asociază prin cod SAGA», fără import."
                    : "Introdu codul, denumirea sau CUI-ul și apasă «Caută în lista importată»."}
                </p>
              )}
              <div className="max-h-72 space-y-2 overflow-auto">
                {entries.map((entry) => (
                  <label
                    key={entry.id}
                    className="flex items-start gap-2 rounded border p-2 text-sm"
                  >
                    <input
                      type="radio"
                      name={`saga-client-${clientId}`}
                      checked={selected?.id === entry.id}
                      onChange={() => {
                        setSelected(entry);
                        setMissing(false);
                      }}
                    />
                    <span className="break-words">
                      {entry.code} · {entry.name} · {entry.taxId || "CUI lipsă"}{" "}
                      · {entry.country}
                    </span>
                  </label>
                ))}
              </div>
              {selected && (
                <div className="space-y-2 rounded border p-3">
                  <p className="break-words text-sm">
                    Confirmă asocierea cu {selected.code} · {selected.name}.
                  </p>
                  {needsMissing && (
                    <label className="flex gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={missing}
                        onChange={(e) => setMissing(e.target.checked)}
                      />
                      Confirm explicit identitatea clientului, deși CUI/CIF
                      lipsește într-una dintre surse.
                    </label>
                  )}
                  <Button
                    type="button"
                    disabled={!!needsMissing && !missing}
                    onClick={() => void save()}
                  >
                    Confirmă asocierea în FOM
                  </Button>
                </div>
              )}
              <Button
                type="button"
                variant="ghost"
                onClick={() => changeOpen(false)}
              >
                Închide
              </Button>
            </fieldset>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
