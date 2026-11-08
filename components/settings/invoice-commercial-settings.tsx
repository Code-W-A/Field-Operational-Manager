"use client";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useSagaReferenceRequest } from "./saga-references";
import type {
  CommercialPolicy,
  CommercialBinding,
} from "@/lib/invoicing/commercial";
import type { ReferenceEntry } from "@/lib/saga/references";
import type { SagaCatalog } from "@/lib/saga/catalog";
export function InvoiceCommercialSettings() {
  const request = useSagaReferenceRequest(),
    { user } = useAuth(),
    [policy, setPolicy] = useState<
      (CommercialPolicy & { writesEnabled: boolean }) | null
    >(null),
    [confirmed, setConfirmed] = useState(false),
    [kind, setKind] = useState<"articles" | "warehouses">("articles"),
    [refs, setRefs] = useState<ReferenceEntry[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [catalog, setCatalog] = useState<SagaCatalog | null>(null),
    [selected, setSelected] = useState(""),
    [target, setTarget] = useState(""),
    [binding, setBinding] = useState<CommercialBinding | null>(null),
    [confirmUnit, setConfirmUnit] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const lock = useRef(false);
  useEffect(() => {
    let active = true;
    void request("commercial-policy")
      .then((d) => {
        if (active) setPolicy(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [user?.uid]);
  async function run(fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function load(next = false) {
    await run(async () => {
      const [r, c] = await Promise.all([
        request(
          `references/${kind}?${new URLSearchParams({ cursor: next ? cursor || "" : "", limit: "50" })}`,
        ),
        request("catalog"),
      ]);
      setRefs((old) => (next ? [...old, ...r.entries] : r.entries));
      setCursor(r.nextCursor);
      setCatalog(c);
      setSelected("");
      setTarget("");
      setBinding(null);
    });
  }
  const reference = refs.find((r) => r.id === selected),
    targets = kind === "articles" ? catalog?.products : catalog?.warehouses,
    chosen = targets?.find((t) => t.id === target);
  return (
    <section
      aria-label="Reguli comerciale SAGA"
      className="min-w-0 space-y-3 rounded border p-4 text-sm"
    >
      <h3 className="font-semibold">Reguli comerciale SAGA</h3>
      <p>
        {policy?.enabled
          ? "Active: preț/UM/TVA protejate, TVA pe linii și scadență din referințe."
          : "Regulile noi sunt inactive."}{" "}
        Activarea se aplică tuturor pregătirilor noi de XML. Ciornele vechi cer
        aplicare explicită; facturile înghețate rămân neschimbate.
      </p>
      {!policy?.enabled && (
        <>
          <label className="block">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy || !policy?.writesEnabled}
              onChange={(e) => setConfirmed(e.target.checked)}
            />{" "}
            Confirm activarea regulilor comerciale pentru firma conectată
          </label>
          <Button
            type="button"
            disabled={busy || !confirmed || !policy?.writesEnabled}
            onClick={() =>
              run(async () => {
                const p = await request("commercial-policy", "PUT", {
                  expectedRevision: policy!.revision,
                  confirmed: true,
                });
                setPolicy({ ...p, writesEnabled: policy!.writesEnabled });
                setNotice(
                  "Regulile comerciale sunt active. Nicio factură nu a fost emisă.",
                );
              })
            }
          >
            Activează regulile comerciale
          </Button>
        </>
      )}
      <details>
        <summary className="cursor-pointer">
          Legături explicite între referințe și asocierile FOM
        </summary>
        <div className="space-y-2 pt-2">
          <p>
            Folosește asocieri existente cu același cod exact. Pentru preț se
            cere verificare API și moneda RON în export. Gestiunile se leagă
            separat, apoi sunt selectate dintre cele permise produsului.
          </p>
          <select
            aria-label="Tip legătură comercială"
            className="w-full min-w-0 rounded border p-2"
            value={kind}
            disabled={busy}
            onChange={(e) => {
              setKind(e.target.value as typeof kind);
              setRefs([]);
              setSelected("");
              setTarget("");
              setBinding(null);
              setCatalog(null);
              setCursor(null);
            }}
          >
            <option value="articles">Articole → produse FOM asociate</option>
            <option value="warehouses">Gestiuni → gestiuni FOM asociate</option>
          </select>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => load()}
          >
            Încarcă referințele pentru asociere
          </Button>
          {refs.length > 0 && (
            <>
              <label className="block">
                Referință SAGA
                <select
                  aria-label="Referință pentru legătura comercială"
                  className="w-full min-w-0 rounded border p-2"
                  value={selected}
                  disabled={busy}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelected(id);
                    setTarget("");
                    setBinding(null);
                    setConfirmUnit(false);
                    if (id)
                      void run(async () => {
                        const d = await request(`commercial-bindings/${id}`);
                        setBinding(d.binding);
                        setTarget(d.binding?.targetId || "");
                      });
                  }}
                >
                  <option value="">Alege referința</option>
                  {refs.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.code} — {r.name}
                    </option>
                  ))}
                </select>
              </label>
              {reference && (
                <>
                  <p>
                    Cod: {reference.code} · Monedă:{" "}
                    {String(reference.exportData.currency || "neconfirmată")} ·
                    UM API: {reference.apiSnapshot?.unit || "neverificată"}
                  </p>
                  <label className="block">
                    Asociere existentă FOM
                    <select
                      aria-label="Țintă legătură comercială"
                      className="w-full min-w-0 rounded border p-2"
                      value={target}
                      disabled={busy}
                      onChange={(e) => {
                        setTarget(e.target.value);
                        setConfirmUnit(false);
                      }}
                    >
                      <option value="">Alege asocierea existentă</option>
                      {targets
                        ?.filter((t) => t.active && t.code === reference.code)
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.code} — {t.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="block">
                    <input
                      type="checkbox"
                      checked={confirmUnit}
                      disabled={busy}
                      onChange={(e) => setConfirmUnit(e.target.checked)}
                    />{" "}
                    Confirm actualizarea UM a asocierii din verificarea API,
                    dacă diferă
                  </label>
                  <Button
                    type="button"
                    disabled={busy || !policy?.writesEnabled || !chosen}
                    onClick={() =>
                      run(async () => {
                        const d = await request(
                          `commercial-bindings/${reference.id}`,
                          "PUT",
                          {
                            expectedRevision: binding?.revision || 0,
                            expectedReferenceRevision: reference.revision,
                            expectedTargetRevision: chosen!.revision,
                            targetId: target,
                            confirmUnit,
                          },
                        );
                        setBinding(d.binding);
                        setCatalog(await request("catalog"));
                        setNotice(
                          "Legătura comercială a fost salvată exclusiv în FOM.",
                        );
                      })
                    }
                  >
                    Salvează legătura comercială
                  </Button>
                </>
              )}
            </>
          )}
          {cursor && (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => load(true)}
            >
              Mai multe referințe pentru asociere
            </Button>
          )}
        </div>
      </details>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
