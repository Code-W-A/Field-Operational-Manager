"use client";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSagaReferenceRequest } from "./saga-references";
import type { IssuerConfiguration, IssuerUser } from "@/lib/saga/references";
import {
  formatInvoiceNumber,
  type NumberingCounter,
} from "@/lib/invoicing/numbering";
type Entry = {
  profile: IssuerConfiguration;
  user: IssuerUser;
  counter: NumberingCounter | null;
};
type InputData = {
  expectedRevision: number;
  profiles: { uid: string; expectedRevision: number }[];
  correction?: { uid: string; lastVerifiedNumber: string; reason: string };
};
type Preview = {
  input: InputData;
  confirmationHash: string;
  entries: {
    uid: string;
    name: string;
    profile: IssuerConfiguration;
    lastNumber: string;
    width: number;
    nextNumber: string;
  }[];
};
export function UserInvoiceNumberingSettings({
  correctionsOnly = false,
}: { correctionsOnly?: boolean } = {}) {
  const request = useSagaReferenceRequest(),
    { user } = useAuth();
  const [entries, setEntries] = useState<Entry[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [revision, setRevision] = useState(0),
    [mode, setMode] = useState("legacy"),
    [enabled, setEnabled] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [correctionUid, setCorrectionUid] = useState(""),
    [last, setLast] = useState(""),
    [reason, setReason] = useState(""),
    [preview, setPreview] = useState<Preview | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const lock = useRef(false);
  async function load(cursor = "") {
    const data = await request(
      `numbering/users${cursor ? "?cursor=" + encodeURIComponent(cursor) : ""}`,
    );
    setEntries((old) => (cursor ? [...old, ...data.entries] : data.entries));
    setCursor(data.nextCursor);
    setRevision(data.revision);
    setMode(data.mode);
    setEnabled(data.writesEnabled);
    setSelected([]);
    setPreview(null);
  }
  useEffect(() => {
    let active = true;
    void request("numbering/users")
      .then((d) => {
        if (active) {
          setEntries(d.entries);
          setCursor(d.nextCursor);
          setRevision(d.revision);
          setMode(d.mode);
          setEnabled(d.writesEnabled);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [user?.uid]);
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
      setPreview(null);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function inspect(correction = false) {
    await run(async () => {
      const input: InputData = {
        expectedRevision: revision,
        profiles: correction
          ? []
          : entries
              .filter((e) => selected.includes(e.user.uid))
              .map((e) => ({
                uid: e.user.uid,
                expectedRevision: e.profile.revision,
              })),
        ...(correction
          ? {
              correction: {
                uid: correctionUid,
                lastVerifiedNumber: last,
                reason,
              },
            }
          : {}),
      };
      setPreview(await request("numbering/users/preview", "POST", input));
    });
  }
  return (
    <section
      aria-label="Numerotare pe utilizator"
      className="min-w-0 space-y-3 rounded border p-4 text-sm"
    >
      <h3 className="font-semibold">Numerotare pe utilizator</h3>
      <p>
        {mode === "per_user"
          ? "Activă: seria este aleasă după utilizator."
          : "Numerotarea generală este încă activă."}{" "}
        Activarea nu consumă numere. Conturile fără profil activ pot salva
        ciorne, dar nu pot pregăti XML după trecerea la numerotarea pe
        utilizator.
      </p>
      {!correctionsOnly && (
        <p>
          Selectează maximum 20 de profiluri configurate pentru admin/dispecer.
        </p>
      )}
      <div className="space-y-2">
        {entries.map((e) => (
          <div
            key={e.user.uid}
            className="min-w-0 rounded border p-2 [overflow-wrap:anywhere]"
          >
            <label>
              {!correctionsOnly && (
                <input
                  type="checkbox"
                  checked={selected.includes(e.user.uid)}
                  disabled={
                    busy ||
                    !enabled ||
                    !!e.profile.numbering ||
                    e.user.disabled ||
                    !["admin", "dispecer"].includes(e.user.role)
                  }
                  onChange={(ev) => {
                    setSelected((v) =>
                      ev.target.checked
                        ? [...v, e.user.uid]
                        : v.filter((x) => x !== e.user.uid),
                    );
                    setPreview(null);
                  }}
                />
              )}{" "}
              {e.user.name} · {e.user.uid} · {e.profile.prefix}
            </label>
            <p>
              {e.profile.numbering ? "Profil activ" : "Profil pregătit"} ·
              Ultima valoare verificată: {e.profile.lastVerifiedNumber}
            </p>
            {e.counter && (
              <p>
                Ultimul număr alocat/configurat:{" "}
                {formatInvoiceNumber(
                  e.counter.prefix,
                  e.counter.lastNumber,
                  e.counter.width,
                )}{" "}
                · {e.counter.allocationCount} alocări
              </p>
            )}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {!correctionsOnly && (
          <Button
            type="button"
            disabled={
              busy || !enabled || !selected.length || selected.length > 20
            }
            onClick={() => inspect()}
          >
            Previzualizează activarea
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => run(() => load())}
        >
          Reîncarcă numerotarea pe utilizator
        </Button>
        {cursor && (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => run(() => load(cursor))}
          >
            Mai multe profiluri
          </Button>
        )}
      </div>
      {mode === "per_user" && (
        <details>
          <summary className="cursor-pointer">
            Corectează înainte un contor activ
          </summary>
          <div className="space-y-2 pt-2">
            <label className="block">
              Profil activ
              <select
                aria-label="Profil pentru corecție"
                className="w-full min-w-0 rounded border p-2"
                value={correctionUid}
                disabled={busy}
                onChange={(e) => {
                  setCorrectionUid(e.target.value);
                  setPreview(null);
                }}
              >
                <option value="">Alege profilul</option>
                {entries
                  .filter((e) => e.profile.numbering)
                  .map((e) => (
                    <option key={e.user.uid} value={e.user.uid}>
                      {e.user.name} · {e.profile.prefix}
                    </option>
                  ))}
              </select>
            </label>
            <label className="block">
              Ultima valoare verificată în SAGA
              <Input
                aria-label="Valoare corecție contor"
                value={last}
                inputMode="numeric"
                maxLength={18}
                disabled={busy}
                onChange={(e) => {
                  setLast(e.target.value);
                  setPreview(null);
                }}
              />
            </label>
            <label className="block">
              Motiv
              <Input
                aria-label="Motiv corecție contor"
                value={reason}
                maxLength={500}
                disabled={busy}
                onChange={(e) => {
                  setReason(e.target.value);
                  setPreview(null);
                }}
              />
            </label>
            <Button
              type="button"
              disabled={
                busy || !enabled || !correctionUid || !last || !reason.trim()
              }
              onClick={() => inspect(true)}
            >
              Previzualizează corecția
            </Button>
          </div>
        </details>
      )}
      {preview && (
        <div
          role="group"
          aria-label="Confirmare numerotare utilizator"
          className="space-y-2 rounded border p-3"
        >
          <p>
            Confirmă valorile verificate în SAGA și utilizarea exclusivă a
            seriilor prin FOM. Numerele următoare sunt estimări, nu rezervări.
          </p>
          {preview.entries.map((e) => (
            <p key={e.uid} className="[overflow-wrap:anywhere]">
              {e.name} · {e.profile.prefix} · ultima valoare:{" "}
              {formatInvoiceNumber(e.profile.prefix, e.lastNumber, e.width)} →
              următorul: {e.nextNumber}
            </p>
          ))}
          <Button
            type="button"
            disabled={busy || !enabled}
            onClick={() =>
              run(async () => {
                await request("numbering/users/activate", "POST", {
                  ...preview.input,
                  confirmationHash: preview.confirmationHash,
                });
                await load();
                setNotice(
                  "Numerotarea pe utilizator a fost actualizată. Niciun număr nu a fost rezervat.",
                );
                window.dispatchEvent(new Event("invoice-numbering-changed"));
              })
            }
          >
            Confirmă{" "}
            {preview.input.correction
              ? "corecția contorului"
              : "activarea numerotării"}
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!enabled && <p>Scrierile integrării sunt dezactivate.</p>}
    </section>
  );
}
