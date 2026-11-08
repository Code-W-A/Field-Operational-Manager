"use client";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  REFERENCE_KINDS,
  REFERENCE_LABELS,
  REFERENCE_FIELDS,
  REFERENCE_BATCH,
  type ReferenceKind,
  type ReferenceRow,
  type ReferenceEntry,
  type ReferenceImport,
} from "@/lib/saga/references";
import type { ExportSheet } from "@/lib/saga/clients";
export function useSagaReferenceRequest() {
  const { user } = useAuth();
  return async (path: string, method = "GET", body?: unknown) => {
    const token = await user?.getIdToken();
    const r = await fetch(`/api/integrations/saga/${path}`, {
      method,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token || ""}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Operațiune indisponibilă.");
    return data;
  };
}
const selectClass = "w-full min-w-0 rounded border bg-white p-2 text-sm";
export function SagaReferences() {
  const [kind, setKind] = useState<ReferenceKind>("articles");
  return (
    <section
      className="min-w-0 space-y-4 rounded-lg border p-4"
      aria-label="Cataloage de referință"
    >
      <h3 className="font-semibold">Cataloage de referință SAGA</h3>
      <p className="text-sm text-muted-foreground">
        Referințe separate din exporturi. Nu modifică asocierile, ciornele sau
        contoarele existente.
      </p>
      <label className="block">
        Catalog
        <select
          aria-label="Catalog de referință"
          className={selectClass}
          value={kind}
          onChange={(e) => setKind(e.target.value as ReferenceKind)}
        >
          {REFERENCE_KINDS.map((k) => (
            <option key={k} value={k}>
              {REFERENCE_LABELS[k]}
            </option>
          ))}
        </select>
      </label>
      <ReferenceCatalog key={kind} kind={kind} />
    </section>
  );
}
function ReferenceCatalog({ kind }: { kind: ReferenceKind }) {
  const request = useSagaReferenceRequest(),
    { user } = useAuth();
  const [entries, setEntries] = useState<ReferenceEntry[]>([]),
    [q, setQ] = useState(""),
    [field, setField] = useState("code"),
    [search, setSearch] = useState({ q: "", field: "code" }),
    [cursor, setCursor] = useState(""),
    [previous, setPrevious] = useState<string[]>([]),
    [next, setNext] = useState<string | null>(null),
    [enabled, setEnabled] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError("");
    void request(
      `references/${kind}?${new URLSearchParams({ ...search, cursor })}`,
    )
      .then((d) => {
        if (active) {
          setEntries(d.entries);
          setNext(d.nextCursor);
          setEnabled(d.writesEnabled);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [user?.uid, kind, search, cursor, version]);
  async function verify(e: ReferenceEntry) {
    setBusy(true);
    setError("");
    try {
      await request(`references/articles/${e.id}/verify`, "POST", {
        expectedRevision: e.revision,
      });
      setVersion((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="min-w-0 space-y-4">
      <ReferenceImportPanel
        kind={kind}
        enabled={enabled}
        onComplete={() => setVersion((v) => v + 1)}
      />
      <form
        className="grid gap-2 sm:grid-cols-[auto_1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          setCursor("");
          setPrevious([]);
          setSearch({ q, field });
        }}
      >
        <select
          aria-label="Caută referințele după"
          className={selectClass}
          value={field}
          onChange={(e) => setField(e.target.value)}
        >
          <option value="code">Început cod</option>
          <option value="name">Început denumire</option>
        </select>
        <Input
          aria-label="Căutare referințe"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cod sau denumire"
        />
        <Button disabled={busy}>Caută referințe</Button>
      </form>
      {error && <p role="alert">{error}</p>}
      <div className="space-y-3" aria-busy={busy}>
        {entries.map((e) => (
          <article
            key={e.id}
            className="min-w-0 space-y-2 rounded border p-3 text-sm [overflow-wrap:anywhere]"
          >
            <strong>
              {e.code} — {e.name}
            </strong>
            <p>
              Export:{" "}
              {REFERENCE_FIELDS[kind]
                .filter((f) => !["code", "name"].includes(f.key))
                .map((f) => `${f.label}: ${display(e.exportData[f.key])}`)
                .join(" · ") || "cod și denumire"}
            </p>
            <p className="text-muted-foreground">
              Sursă: {e.source} · Import: {e.importedAt} · Revizie {e.revision}{" "}
              · Autor: {e.updatedBy}
            </p>
            {kind === "articles" && (
              <>
                <p>
                  Ultima verificare API:{" "}
                  {e.apiSnapshot
                    ? `${e.apiSnapshot.name} · UM ${e.apiSnapshot.unit} · TVA ${display(e.apiSnapshot.vat)} · Preț ${display(e.apiSnapshot.price)} · ${e.apiSnapshot.checkedAt}`
                    : "Neverificat online"}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || !enabled}
                  onClick={() => verify(e)}
                >
                  Verifică / actualizează din SAGA
                </Button>
              </>
            )}
          </article>
        ))}
        {!busy && !entries.length && (
          <p className="text-sm">Nu există referințe pentru această căutare.</p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={busy || !previous.length}
          onClick={() => {
            setCursor(previous.at(-1) || "");
            setPrevious((v) => v.slice(0, -1));
          }}
        >
          Pagina precedentă
        </Button>
        <Button
          variant="outline"
          disabled={busy || !next}
          onClick={() => {
            setPrevious((v) => [...v, cursor]);
            setCursor(next || "");
          }}
        >
          Pagina următoare
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => setVersion((v) => v + 1)}
        >
          Reîncarcă referințele
        </Button>
      </div>
    </div>
  );
}
function display(v: unknown) {
  return v === null || v === undefined || v === ""
    ? "Lipsă"
    : typeof v === "boolean"
      ? v
        ? "Da"
        : "Nu"
      : String(v);
}
function ReferenceImportPanel({
  kind,
  enabled,
  onComplete,
}: {
  kind: ReferenceKind;
  enabled: boolean;
  onComplete: () => void;
}) {
  const request = useSagaReferenceRequest();
  const [file, setFile] = useState<File | null>(null),
    [sheet, setSheet] = useState<ExportSheet | null>(null),
    [mapping, setMapping] = useState<Record<string, string>>({}),
    [rows, setRows] = useState<Record<string, unknown>[] | null>(null),
    [canonical, setCanonical] = useState<ReferenceRow[] | null>(null),
    [ambiguous, setAmbiguous] = useState<string[]>([]),
    [confirmed, setConfirmed] = useState<string[]>([]),
    [job, setJob] = useState<ReferenceImport | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [page, setPage] = useState(0);
  const lock = useRef(false);
  useEffect(() => {
    let active = true;
    void request(`references/${kind}/imports`)
      .then((d) => {
        if (active) setJob(d.job);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [kind]);
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  async function inspect(selected?: string) {
    await run(async () => {
      if (!file) throw new Error("Alege un fișier.");
      const { readClientExport } = await import("@/lib/saga/client-export");
      const data = await readClientExport(
        new Uint8Array(await file.arrayBuffer()),
        file.name,
        selected,
      );
      setSheet(data);
      setMapping({});
      setRows(null);
      setCanonical(null);
      setAmbiguous([]);
      setConfirmed([]);
      setPage(0);
    });
  }
  function preview() {
    if (!sheet) return;
    setError("");
    if (
      REFERENCE_FIELDS[kind].some(
        (f) =>
          f.required && (mapping[f.key] === undefined || mapping[f.key] === ""),
      )
    ) {
      setError("Alege coloanele obligatorii.");
      return;
    }
    const flags: string[] = [];
    const data = sheet.rows.map((row, i) =>
      Object.fromEntries(
        REFERENCE_FIELDS[kind].map((f) => {
          const cell =
            mapping[f.key] !== undefined && mapping[f.key] !== ""
              ? row[Number(mapping[f.key])]
              : null;
          if (f.type === "code" && cell?.ambiguous) flags.push(`${i}:${f.key}`);
          return [f.key, cell?.text || ""];
        }),
      ),
    );
    setRows(data);
    setCanonical(null);
    setAmbiguous(flags);
    setConfirmed([]);
    setPage(0);
  }
  async function validate() {
    await run(async () => {
      if (!rows) throw new Error("Pregătește previzualizarea.");
      if (ambiguous.some((k) => !confirmed.includes(k)))
        throw new Error(
          "Corectează și confirmă codurile Excel numerice/ambigue.",
        );
      setCanonical(
        (await request(`references/${kind}/preview`, "POST", rows)).rows,
      );
    });
  }
  async function save() {
    await run(async () => {
      if (!canonical || !file || !sheet)
        throw new Error("Validează previzualizarea.");
      const chunks: ReferenceRow[][] = [];
      for (let i = 0; i < canonical.length; i += REFERENCE_BATCH)
        chunks.push(canonical.slice(i, i + REFERENCE_BATCH));
      const hashes = await Promise.all(
        chunks.map(async (c) => {
          const bytes = new Uint8Array(
            await crypto.subtle.digest(
              "SHA-256",
              new TextEncoder().encode(JSON.stringify(c)),
            ),
          );
          return Array.from(bytes)
            .map((x) => x.toString(16).padStart(2, "0"))
            .join("");
        }),
      );
      let current: ReferenceImport = await request(
        `references/${kind}/imports`,
        "POST",
        {
          source: `${file.name} / ${sheet.sheet}`,
          total: canonical.length,
          hashes,
        },
      );
      setJob(current);
      for (let index = current.next; index < chunks.length; index++) {
        current = await request(
          `references/${kind}/imports/${current.id}/batch`,
          "POST",
          { index, rows: chunks[index] },
        );
        setJob(current);
      }
      onComplete();
    });
  }
  function edit(index: number, key: string, value: string) {
    setRows(
      (old) =>
        old?.map((r, i) => (i === index ? { ...r, [key]: value } : r)) || null,
    );
    setCanonical(null);
    setConfirmed((v) => v.filter((k) => k !== `${index}:${key}`));
  }
  return (
    <details className="min-w-0 rounded border p-3">
      <summary className="cursor-pointer font-medium">
        Importă {REFERENCE_LABELS[kind].toLocaleLowerCase("ro")}
      </summary>
      <div className="min-w-0 space-y-3 pt-3">
        <p className="text-sm">
          CSV UTF-8 / XLSX, maximum 10 MB și 5.000 de rânduri. Fișiere succesive
          completează lista, fără ștergeri. Prețurile provin din fișier; nu se
          editează manual aici.
        </p>
        {kind === "clientTerms" && (
          <p className="text-sm">
            Codurile trebuie să existe în lista de clienți importată. Stare
            termen: unknown = necunoscut, none = lipsă confirmată, days = număr
            de zile. Fără stare și fără zile: necunoscut. Zero zile este un
            termen valid.
          </p>
        )}
        <input
          aria-label="Fișier referințe"
          className="block w-full min-w-0 text-sm"
          type="file"
          accept=".csv,.xlsx"
          disabled={busy || !enabled}
          onChange={(e) => {
            setFile(e.target.files?.[0] || null);
            setSheet(null);
            setRows(null);
            setCanonical(null);
          }}
        />
        <Button
          type="button"
          disabled={!file || busy || !enabled}
          onClick={() => inspect()}
        >
          Citește fișierul de referință
        </Button>
        {sheet && (
          <>
            <label className="block">
              Foaie de calcul
              <select
                aria-label="Foaie referințe"
                className={selectClass}
                value={sheet.sheet}
                disabled={busy}
                onChange={(e) => inspect(e.target.value)}
              >
                {sheet.sheets.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              {REFERENCE_FIELDS[kind].map((f) => (
                <label key={f.key} className="min-w-0 text-sm">
                  {f.label}
                  {f.required ? " *" : ""}
                  <select
                    aria-label={`Coloană ${f.label}`}
                    className={selectClass}
                    value={mapping[f.key] ?? ""}
                    disabled={busy}
                    onChange={(e) => {
                      setMapping((v) => ({ ...v, [f.key]: e.target.value }));
                      setRows(null);
                      setCanonical(null);
                    }}
                  >
                    <option value="">Nu importa această coloană</option>
                    {sheet.headers.map((h, i) => (
                      <option key={i} value={i}>
                        {i + 1}. {h}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <Button type="button" disabled={busy} onClick={preview}>
              Previzualizează referințele
            </Button>
          </>
        )}
        {rows && (
          <>
            <p>
              {rows.length} rânduri · previzualizare {page * 25 + 1}–
              {Math.min(rows.length, (page + 1) * 25)}
            </p>
            <div className="space-y-2">
              {rows.slice(page * 25, (page + 1) * 25).map((r, offset) => {
                const index = page * 25 + offset;
                return (
                  <div
                    key={index}
                    className="rounded border p-2 text-sm [overflow-wrap:anywhere]"
                  >
                    {REFERENCE_FIELDS[kind].map((f) =>
                      f.type === "code" ? (
                        <div key={f.key}>
                          <label>
                            {f.label}
                            <Input
                              aria-label={`${f.label} rând ${index + 1}`}
                              value={String(r[f.key] || "")}
                              disabled={busy}
                              onChange={(e) =>
                                edit(index, f.key, e.target.value)
                              }
                            />
                          </label>
                          {ambiguous.includes(`${index}:${f.key}`) && (
                            <label className="block">
                              <input
                                type="checkbox"
                                checked={confirmed.includes(
                                  `${index}:${f.key}`,
                                )}
                                onChange={(e) => {
                                  setConfirmed((v) =>
                                    e.target.checked
                                      ? [...v, `${index}:${f.key}`]
                                      : v.filter(
                                          (k) => k !== `${index}:${f.key}`,
                                        ),
                                  );
                                  setCanonical(null);
                                }}
                              />{" "}
                              Am verificat codul complet în SAGA, inclusiv
                              zerourile inițiale
                            </label>
                          )}
                        </div>
                      ) : f.type === "term" ? (
                        <label key={f.key} className="block">
                          Stare termen
                          <select
                            aria-label={`Stare termen rând ${index + 1}`}
                            className={selectClass}
                            value={String(r[f.key] || "")}
                            disabled={busy}
                            onChange={(e) => edit(index, f.key, e.target.value)}
                          >
                            <option value="">
                              Din fișier / dedus din zile
                            </option>
                            <option value="unknown">Necunoscut</option>
                            <option value="none">Lipsă confirmată</option>
                            <option value="days">Număr de zile</option>
                          </select>
                        </label>
                      ) : (
                        <p key={f.key}>
                          {f.label}: {display(r[f.key])}
                        </p>
                      ),
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy || page === 0}
                onClick={() => setPage((v) => v - 1)}
              >
                Rândurile precedente
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy || (page + 1) * 25 >= rows.length}
                onClick={() => setPage((v) => v + 1)}
              >
                Rândurile următoare
              </Button>
              <Button
                type="button"
                disabled={busy || !enabled}
                onClick={validate}
              >
                Validează previzualizarea
              </Button>
            </div>
            {canonical && (
              <div className="rounded border p-3">
                <p>
                  Previzualizare validată: {canonical.length} referințe unice.
                  Confirmarea salvează exclusiv în FOM.
                </p>
                <Button
                  type="button"
                  disabled={busy || !enabled}
                  onClick={save}
                >
                  Confirmă și importă referințele
                </Button>
              </div>
            )}
          </>
        )}
        {job && (
          <div className="rounded border p-2 text-sm">
            <p>
              Import {job.source}: {job.next}/{job.chunks} loturi · {job.status}
            </p>
            {job.status === "running" && (
              <>
                <p>
                  Pentru reluare, încarcă același fișier și confirmă aceeași
                  previzualizare.
                </p>
                <details>
                  <summary>Anulare import</summary>
                  <p>Referințele deja salvate rămân disponibile.</p>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy || !enabled}
                    onClick={() =>
                      run(async () => {
                        await request(
                          `references/${kind}/imports/${job.id}/cancel`,
                          "POST",
                        );
                        setJob({ ...job, status: "cancelled" });
                        onComplete();
                      })
                    }
                  >
                    Confirmă anularea importului
                  </Button>
                </details>
              </>
            )}
          </div>
        )}
        {!enabled && (
          <p className="text-sm">
            Importul este indisponibil până la activarea scrierilor integrării.
          </p>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
    </details>
  );
}
