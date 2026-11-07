"use client";
import { SagaCatalogSettings } from "./saga-catalog";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { SagaReadResult, SagaStatus } from "@/lib/saga/contracts";

const stateLabels: Record<SagaStatus["state"], string> = {
  disabled: "Configurată · citiri dezactivate",
  unconfigured: "Configurare incompletă",
  ready: "Pregătită pentru consultare",
  connected: "Conexiune verificată",
  busy: "Consultare în curs",
  needs_review: "Conexiunea necesită verificare",
  authorization_error: "Autentificare respinsă de SAGA",
};
export function SagaTab() {
  const { user } = useAuth();
  const [status, setStatus] = useState<SagaStatus | null>(null),
    [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<"article" | "stock">("article"),
    [code, setCode] = useState(""),
    [warehouse, setWarehouse] = useState(""),
    [date, setDate] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<SagaReadResult | null>(null);
  const lock = useRef(false);
  async function request(path: string, body?: unknown) {
    const token = await user?.getIdToken();
    const response = await fetch(`/api/integrations/saga/${path}`, {
      method: body ? "POST" : "GET",
      cache: "no-store",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => {
      throw new Error("Serverul nu a putut răspunde. Reîncearcă.");
    });
    if (!response.ok)
      throw new Error(data.error || "Consultarea nu a putut fi efectuată.");
    return data;
  }
  async function refresh() {
    setLoading(true);
    try {
      setStatus(await request("status"));
    } catch (e) {
      setError((e as Error).message);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    setResult(null);
    setError("");
    setStatus(null);
    void request("status")
      .then((data) => {
        if (active) setStatus(data);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user?.uid]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      setResult(
        await request("read", {
          kind,
          code,
          ...(kind === "stock" ? { warehouse, date } : {}),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      await refresh();
      lock.current = false;
      setBusy(false);
    }
  }
  const canRead =
    status?.configured && ["ready", "connected"].includes(status.state);
  return (
    <Card>
      <CardHeader>
        <CardTitle>SAGA</CardTitle>
        <CardDescription>
          Consultă articolele și stocul firmei conectate.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <SagaCatalogSettings />
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-slate-50 p-4">
          <div>
            <p className="font-medium" role="status">
              {loading
                ? "Se verifică configurarea…"
                : status
                  ? stateLabels[status.state]
                  : "Stare indisponibilă"}
            </p>
            {status?.fiscalCode && (
              <p className="text-sm">Cod fiscal firmă: {status.fiscalCode}</p>
            )}
            {status?.lastReadAt && (
              <p className="text-sm text-muted-foreground">
                Ultima consultare reușită:{" "}
                {new Date(status.lastReadAt).toLocaleString("ro-RO", {
                  timeZone: "Europe/Bucharest",
                })}
              </p>
            )}
          </div>
          <Button
            variant="outline"
            disabled={loading || busy}
            onClick={() => {
              setError("");
              void refresh();
            }}
          >
            Actualizează starea
          </Button>
        </div>
        {status?.state === "disabled" && (
          <p className="rounded-md bg-amber-50 p-3 text-sm">
            Citirile sunt dezactivate până la pregătirea accesului securizat.
            Administratorul poate activa integrarea după publicarea regulilor
            Firestore.
          </p>
        )}
        {!!status?.missing.length && (
          <div className="rounded-md bg-amber-50 p-3 text-sm">
            {status.missing.map((item, i) => (
              <p key={i}>{item}</p>
            ))}
          </div>
        )}
        {status &&
          ["needs_review", "authorization_error"].includes(status.state) && (
            <p className="rounded-md bg-amber-50 p-3 text-sm">
              Consultările sunt oprite. Administratorul trebuie să verifice
              cheia curentă și ultima operațiune înainte de reluarea conexiunii.
            </p>
          )}
        {error && (
          <p
            role="alert"
            className="rounded-md bg-red-50 p-3 text-sm text-red-800"
          >
            {error}
          </p>
        )}
        <form onSubmit={submit} className="space-y-4">
          <fieldset
            disabled={busy || loading || !canRead}
            className="space-y-4"
          >
            <legend className="mb-2 font-semibold">Consultare SAGA</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span>Ce consulți</span>
                <select
                  aria-label="Ce consulți"
                  className="h-10 w-full rounded-md border bg-background px-3"
                  value={kind}
                  onChange={(e) => {
                    setKind(e.target.value as typeof kind);
                    setResult(null);
                    setError("");
                  }}
                >
                  <option value="article">Articol</option>
                  <option value="stock">Stoc articol</option>
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span>Cod articol SAGA</span>
                <Input
                  aria-label="Cod articol SAGA"
                  required
                  maxLength={100}
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value);
                    setResult(null);
                  }}
                  autoComplete="off"
                  placeholder="Codul exact din SAGA"
                />
              </label>
              {kind === "stock" && (
                <>
                  <label className="space-y-1 text-sm">
                    <span>Cod gestiune (opțional)</span>
                    <Input
                      aria-label="Cod gestiune"
                      maxLength={100}
                      value={warehouse}
                      onChange={(e) => {
                        setWarehouse(e.target.value);
                        setResult(null);
                      }}
                      autoComplete="off"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span>Data stocului (opțional)</span>
                    <Input
                      aria-label="Data stocului"
                      type="date"
                      value={date}
                      onChange={(e) => {
                        setDate(e.target.value);
                        setResult(null);
                      }}
                    />
                  </label>
                </>
              )}
            </div>
            {kind === "stock" && (
              <p className="text-sm text-muted-foreground">
                {warehouse.trim()
                  ? `Gestiunea selectată: ${warehouse.trim()}.`
                  : "Fără gestiune selectată: stocul privește toate gestiunile."}{" "}
                {date
                  ? "Se folosește data selectată."
                  : "Se folosește data curentă din SAGA."}
              </p>
            )}
            <Button type="submit" disabled={!code.trim()}>
              {busy
                ? "Se consultă SAGA…"
                : kind === "article"
                  ? "Consultă articolul"
                  : "Consultă stocul"}
            </Button>
          </fieldset>
        </form>
        {result && (
          <section
            aria-label="Rezultat SAGA"
            className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm"
          >
            <h3 className="font-semibold">
              {result.kind === "article"
                ? "Articol preluat din SAGA"
                : "Stoc preluat din SAGA"}
            </h3>
            <p>Cod articol: {result.code}</p>
            {result.article && (
              <dl className="grid gap-2 sm:grid-cols-2">
                <div>
                  <dt>Denumire</dt>
                  <dd className="font-medium break-words">
                    {result.article.name}
                  </dd>
                </div>
                <div>
                  <dt>UM</dt>
                  <dd>{result.article.unit}</dd>
                </div>
                <div>
                  <dt>TVA (%)</dt>
                  <dd>{result.article.vat || "Nefurnizat"}</dd>
                </div>
                <div>
                  <dt>Preț vânzare 1</dt>
                  <dd>{result.article.price || "Nefurnizat"}</dd>
                </div>
              </dl>
            )}
            {result.kind === "stock" && (
              <>
                <p>
                  {result.warehouse
                    ? `Gestiune: ${result.warehouse}`
                    : "Toate gestiunile"}
                </p>
                <p className="text-lg font-semibold">Stoc: {result.quantity}</p>
                <p>Data: {result.date || "Data curentă din SAGA"}</p>
              </>
            )}
            <p className="text-xs text-muted-foreground">
              Consultat la{" "}
              {new Date(result.checkedAt).toLocaleString("ro-RO", {
                timeZone: "Europe/Bucharest",
              })}
            </p>
          </section>
        )}
      </CardContent>
    </Card>
  );
}
