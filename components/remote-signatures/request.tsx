"use client";
import { useEffect, useRef, useState } from "react";
import { auth } from "@/lib/firebase/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function RemoteSignatureRequest({
  workId,
  kind,
  sheetId,
  defaultEmail = "",
  disabled = false,
  prepare,
  contentKey,
  manageOnly = false,
}: {
  workId: string;
  kind: "report" | "sheet" | "completion";
  sheetId?: string;
  defaultEmail?: string;
  disabled?: boolean;
  contentKey?: string;
  manageOnly?: boolean;
  prepare: () => Promise<{
    technicianSignature: string;
    expectedVersion?: string | number;
    observations?: string;
  }>;
}) {
  const [open, setOpen] = useState(false),
    [email, setEmail] = useState(defaultEmail),
    [record, setRecord] = useState<any>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const lock = useRef(false),
    attempt = useRef<{ input: any; requestId: string } | null>(null);
  const api = async (input?: any) => {
    const user = auth.currentUser;
    if (!user) throw new Error("Autentifică-te din nou.");
    const query = new URLSearchParams({
      workId,
      kind,
      ...(sheetId ? { sheetId } : {}),
    });
    const r = await fetch(`/api/remote-signatures${input ? "" : `?${query}`}`, {
      method: input ? "POST" : "GET",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${await user.getIdToken()}`,
        "Content-Type": "application/json",
      },
      ...(input ? { body: JSON.stringify(input) } : {}),
    });
    const data = await r.json();
    if (!r.ok) {
      if (r.status >= 400 && r.status < 500) attempt.current = null;
      throw new Error(data.error || "Solicitarea nu a fost confirmată.");
    }
    return data;
  };
  useEffect(() => {
    if (!open) return;
    let active = true;
    api()
      .then((r) => {
        if (active) setRecord(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [open, workId, kind, sheetId]);
  const run = async (fn: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operația a eșuat.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="space-y-3 w-full">
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => setOpen(!open)}
      >
        Semnează prin email
      </Button>
      {open && (
        <div className="space-y-3 rounded border p-4">
          <p className="text-sm">
            Salvează conținutul și semnătura tehnicianului. Beneficiarul va
            verifica documentul și va confirma prin două emailuri. Modificarea
            documentului anulează solicitarea anterioară.
          </p>
          {record && (
            <p role="status">
              {{
                invited: "Solicitare creată",
                awaiting_confirmation: "Așteaptă confirmarea beneficiarului",
                signed: "Document semnat",
                invalidated: "Document modificat — trimite o solicitare nouă",
                expired: "Solicitare expirată",
                cancelled: "Solicitare anulată",
              }[record.status as string] || record.status}
              {record.email ? ` · ${record.email}` : ""}
              {record.delivery?.[
                record.status === "signed" ? "final" : "invite"
              ]?.status === "unknown" &&
                " · Trimiterea emailului nu este confirmată."}
              {record.delivery?.[
                record.status === "signed" ? "final" : "invite"
              ]?.status === "simulated" &&
                " · Email simulat în mediul de test."}
            </p>
          )}
          {!manageOnly && record?.status !== "signed" && (
            <>
              <label className="block">
                Email beneficiar
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    attempt.current = null;
                    setEmail(e.target.value);
                  }}
                  maxLength={254}
                  disabled={busy || disabled}
                />
              </label>
              <Button
                type="button"
                disabled={busy || disabled || !email.trim()}
                onClick={() =>
                  run(async () => {
                    const prepared = attempt.current ? null : await prepare();
                    if (prepared && !prepared.technicianSignature)
                      throw new Error(
                        "Adaugă și salvează semnătura tehnicianului înainte de solicitare.",
                      );
                    const input = attempt.current?.input || {
                      ...prepared,
                      workId,
                      kind,
                      ...(sheetId ? { sheetId } : {}),
                      email: email.trim(),
                      action: "create",
                    };
                    if (!attempt.current)
                      attempt.current = {
                        input,
                        requestId: crypto.randomUUID(),
                      };
                    const r = await api({
                      ...input,
                      requestId: attempt.current!.requestId,
                    });
                    setRecord(r);
                    attempt.current = null;
                    setNotice(
                      r?.delivery?.invite?.status === "sent"
                        ? "Solicitarea a fost trimisă prin email."
                        : "Solicitarea este salvată. Verifică starea emailului sau copiază linkul.",
                    );
                  })
                }
              >
                {busy ? "Se procesează…" : "Trimite solicitarea"}
              </Button>
            </>
          )}
          {record?.url && (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await navigator.clipboard.writeText(record.url);
                  setNotice("Linkul inițial a fost copiat.");
                })
              }
            >
              Copiază linkul
            </Button>
          )}
          {record && (record.url || record.status === "signed") && (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  setRecord(await api({ action: "resend", id: record.id }));
                  setNotice(
                    "Verifică starea trimiterii. Retrimiterea poate produce un email suplimentar.",
                  );
                })
              }
            >
              {record.status === "signed"
                ? "Retrimite documentul"
                : "Retrimite solicitarea"}
            </Button>
          )}
          {record?.url && (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await api({ action: "cancel", id: record.id });
                  setRecord(await api());
                })
              }
            >
              Anulează solicitarea
            </Button>
          )}
          {!!error && (
            <p role="alert" className="text-red-700 break-words">
              {error}
            </p>
          )}
          {!!notice && <p role="status">{notice}</p>}
        </div>
      )}
    </section>
  );
}
