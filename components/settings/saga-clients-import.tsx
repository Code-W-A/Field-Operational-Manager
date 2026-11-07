"use client";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CLIENT_IMPORT_BATCH,
  validateClientRows,
  type SagaClientRow,
  type ClientImport,
  type ExportSheet,
} from "@/lib/saga/clients";
const fields = [
  ["code", "Cod SAGA"],
  ["name", "Denumire"],
  ["taxId", "CUI/CIF"],
  ["country", "Țară"],
] as const;
export function SagaClientsImport() {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null),
    [sheet, setSheet] = useState<ExportSheet | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({
    code: "",
    name: "",
    taxId: "",
    country: "",
  });
  const [country, setCountry] = useState("");
  const [rows, setRows] = useState<SagaClientRow[] | null>(null),
    [ambiguous, setAmbiguous] = useState<number[]>([]);
  const [job, setJob] = useState<ClientImport | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [page, setPage] = useState(0);
  const lock = useRef(false);
  async function request(path: string, method = "GET", body?: unknown) {
    const token = await user?.getIdToken();
    const multipart = body instanceof FormData;
    const r = await fetch(`/api/integrations/saga/clients${path}`, {
      method,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token || ""}`,
        ...(!multipart && body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? (multipart ? body : JSON.stringify(body)) : undefined,
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Import indisponibil.");
    return data;
  }
  useEffect(() => {
    let active = true;
    void request("/imports")
      .then((data) => {
        if (active) setJob(data.job);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [user?.uid]);
  async function inspect(selected?: string) {
    if (!file || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (file.size > 10 * 1024 * 1024)
        throw new Error("Fișierul depășește 10 MB.");
      const { readClientExport } = await import("@/lib/saga/client-export");
      const result = await readClientExport(
        new Uint8Array(await file.arrayBuffer()),
        file.name,
        selected,
      );
      setSheet(result);
      setRows(null);
      setAmbiguous([]);
      setPage(0);
      setMapping({ code: "", name: "", taxId: "", country: "" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function preview() {
    if (!sheet || mapping.code === "" || mapping.name === "") {
      setError("Alege coloanele pentru cod și denumire.");
      return;
    }
    const ambiguousRows: number[] = [];
    const next = sheet.rows.map((row, i) => {
      if (row[Number(mapping.code)]?.ambiguous) ambiguousRows.push(i);
      return Object.fromEntries(
        fields.map(([key]) => [
          key,
          mapping[key] === ""
            ? key === "country"
              ? country
              : ""
            : row[Number(mapping[key])]?.text ||
              (key === "country" ? country : ""),
        ]),
      ) as SagaClientRow;
    });
    setRows(next);
    setAmbiguous(ambiguousRows);
    setPage(0);
    setError("");
  }
  async function save() {
    if (!rows || !file || lock.current) return;
    if (ambiguous.length) {
      setError(
        "Corectează explicit codurile Excel marcate înainte de confirmare.",
      );
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    let activeJob: ClientImport | null = null;
    try {
      const normalized = validateClientRows(rows);
      const batches = Array.from(
        { length: Math.ceil(normalized.length / CLIENT_IMPORT_BATCH) },
        (_, i) =>
          normalized.slice(
            i * CLIENT_IMPORT_BATCH,
            (i + 1) * CLIENT_IMPORT_BATCH,
          ),
      );
      const hashes = await Promise.all(
        batches.map(async (batch) =>
          Array.from(
            new Uint8Array(
              await crypto.subtle.digest(
                "SHA-256",
                new TextEncoder().encode(JSON.stringify(batch)),
              ),
            ),
          )
            .map((v) => v.toString(16).padStart(2, "0"))
            .join(""),
        ),
      );
      let current: ClientImport = await request("/imports", "POST", {
        total: normalized.length,
        hashes,
        source: `${file.name}${sheet ? ` · ${sheet.sheet}` : ""}`,
      });
      activeJob = current;
      setJob(current);
      for (let index = current.next; index < current.chunks; index++) {
        current = await request(
          `/imports/${encodeURIComponent(current.id)}/batch`,
          "POST",
          {
            index,
            rows: normalized.slice(
              index * CLIENT_IMPORT_BATCH,
              (index + 1) * CLIENT_IMPORT_BATCH,
            ),
          },
        );
        activeJob = current;
        setJob(current);
      }
    } catch (e) {
      if (activeJob) {
        try {
          const latest = await request(
            `/imports?id=${encodeURIComponent(activeJob.id)}`,
          );
          if (latest.job) setJob(latest.job);
          if (latest.job?.status === "completed") return;
        } catch {
          /* Keep the last known progress for a safe retry. */
        }
      }
      setError(
        (e as Error).message +
          (activeJob
            ? " Reîncarcă același fișier și aceeași selecție de coloane pentru a relua importul."
            : ""),
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function cancel() {
    if (!job || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await request(`/imports/${job.id}/cancel`, "POST");
      setJob(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      aria-label="Clienți SAGA"
      className="space-y-3 rounded-lg border p-4"
    >
      <h3 className="font-semibold">Clienți SAGA · listă de referință</h3>
      <p className="text-sm text-muted-foreground">
        Adu un export din SAGA pentru asocierea cu clienții existenți în FOM.
        Lista rămâne separată de registrul FOM. Sursa este exportul, fără
        verificare online.
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {job && (
        <div role="status" className="rounded border p-3 text-sm">
          <p>
            {job.status === "completed" ? "Import finalizat" : "Import în curs"}
            : {Math.min(job.next * CLIENT_IMPORT_BATCH, job.total)} /{" "}
            {job.total} · {job.source}
          </p>
          {job.status === "running" && (
            <>
              <p>
                Pentru reluare, selectează același fișier și aceleași coloane.
              </p>
              <details>
                <summary>Anulează importul în curs</summary>
                <p>Loturile deja salvate rămân în lista de referință.</p>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void cancel()}
                >
                  Confirmă anularea importului
                </Button>
              </details>
            </>
          )}
        </div>
      )}
      <fieldset disabled={busy} className="space-y-3">
        <label className="block text-sm">
          Export clienți (CSV UTF-8 sau XLSX, maximum 10 MB)
          <Input
            type="file"
            accept=".csv,.xlsx"
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              setSheet(null);
              setRows(null);
              setError("");
            }}
          />
        </label>
        <Button
          type="button"
          variant="outline"
          disabled={!file}
          onClick={() => void inspect()}
        >
          Citește exportul
        </Button>
        {sheet && (
          <>
            <label className="block text-sm">
              Foaia
              <select
                aria-label="Foaia exportului"
                className="mt-1 block w-full rounded border p-2"
                value={sheet.sheet}
                onChange={(e) => void inspect(e.target.value)}
              >
                {sheet.sheets.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              {fields.map(([key, label]) => (
                <label key={key} className="text-sm">
                  Coloană {label}
                  <select
                    className="mt-1 block w-full rounded border p-2"
                    aria-label={`Coloană ${label}`}
                    value={mapping[key]}
                    onChange={(e) => {
                      setMapping((m) => ({ ...m, [key]: e.target.value }));
                      setRows(null);
                    }}
                  >
                    <option value="">
                      {key === "code" || key === "name"
                        ? "Alege coloana"
                        : "Fără coloană"}
                    </option>
                    {sheet.headers.map((name, i) => (
                      <option key={i} value={i}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <label className="block text-sm">
              Țară pentru rândurile fără țară (cod din două litere)
              <Input
                maxLength={2}
                value={country}
                onChange={(e) => {
                  setCountry(e.target.value.toUpperCase());
                  setRows(null);
                }}
                placeholder="Exemplu: RO"
              />
            </label>
            <Button type="button" variant="outline" onClick={preview}>
              Pregătește previzualizarea
            </Button>
          </>
        )}
        {rows && (
          <>
            <p className="text-sm">
              {rows.length} rânduri. Verifică datele și confirmă salvarea listei
              în FOM.
            </p>
            <div className="space-y-3">
              {rows.slice(page * 25, (page + 1) * 25).map((row, offset) => {
                const i = page * 25 + offset;
                return (
                  <div key={i} className="space-y-2 rounded border p-3">
                    <p className="text-xs">Rândul {i + 1}</p>
                    {ambiguous.includes(i) && (
                      <div className="space-y-1 text-sm text-amber-800">
                        <p>
                          Cod Excel numeric sau calculat: verifică și corectează
                          codul exact, inclusiv zerourile inițiale.
                        </p>
                        <label className="flex gap-2">
                          <input
                            type="checkbox"
                            onChange={(e) => {
                              if (e.target.checked)
                                setAmbiguous((old) =>
                                  old.filter((n) => n !== i),
                                );
                            }}
                          />
                          Am verificat codul exact din SAGA.
                        </label>
                      </div>
                    )}
                    <div className="grid gap-2 sm:grid-cols-2">
                      {fields.map(([key, label]) => (
                        <label key={key} className="text-sm">
                          {label}
                          <Input
                            aria-label={`${label} rând ${i + 1}`}
                            value={row[key]}
                            maxLength={
                              key === "country" ? 2 : key === "name" ? 300 : 100
                            }
                            onChange={(e) => {
                              setRows((old) =>
                                old!.map((v, index) =>
                                  index === i
                                    ? {
                                        ...v,
                                        [key]:
                                          key === "country"
                                            ? e.target.value.toUpperCase()
                                            : e.target.value,
                                      }
                                    : v,
                                ),
                              );
                              if (key === "code")
                                setAmbiguous((old) =>
                                  old.filter((n) => n !== i),
                                );
                            }}
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                Pagina anterioară
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={(page + 1) * 25 >= rows.length}
                onClick={() => setPage((p) => p + 1)}
              >
                Pagina următoare
              </Button>
            </div>
            <Button
              type="button"
              disabled={ambiguous.length > 0}
              onClick={() => void save()}
            >
              {busy ? "Se salvează…" : "Confirmă și salvează lista în FOM"}
            </Button>
          </>
        )}
      </fieldset>
    </section>
  );
}
