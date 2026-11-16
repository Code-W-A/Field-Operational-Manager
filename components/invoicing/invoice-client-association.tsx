"use client";
import { InvoiceLoading } from "./invoice-feedback";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { normalizeTaxId, type ClientAssociation } from "@/lib/saga/clients";

export function InvoiceClientAssociation({
  workId,
  beneficiaryCui,
  beneficiaryCountry,
}: {
  workId: string;
  beneficiaryCui: string;
  beneficiaryCountry?: string;
}) {
  const { user } = useAuth();
  const currentUser = useRef(user);
  currentUser.current = user;
  const [data, setData] = useState<ClientAssociation | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(true);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let generation = 0;
    let disposed = false;
    async function load() {
      const request = ++generation;
      setError("");
      setRefreshing(true);
      try {
        const token = await currentUser.current?.getIdToken();
        const response = await fetch(
          `/api/lucrari/${encodeURIComponent(workId)}/invoice-draft/client-association`,
          {
            cache: "no-store",
            headers: { Authorization: `Bearer ${token || ""}` },
          },
        );
        const value = await response.json();
        if (!response.ok || !Array.isArray(value.issues)) throw new Error();
        if (!disposed && request === generation) setData(value);
      } catch {
        if (disposed || request !== generation) return;
        setError("Asocierea SAGA nu poate fi încărcată momentan.");
      } finally {
        if (!disposed && request === generation) setRefreshing(false);
      }
    }
    void load();
    window.addEventListener("focus", load);
    return () => {
      disposed = true;
      window.removeEventListener("focus", load);
    };
  }, [workId, user?.uid, refresh]);
  useEffect(() => setData(null), [workId, user?.uid]);
  const country = data?.link?.country || "";
  const fiscalDifference =
    !!data?.link &&
    (normalizeTaxId(beneficiaryCui, country) !==
      normalizeTaxId(data.taxId, country) ||
      (!!beneficiaryCountry &&
        beneficiaryCountry.trim().toUpperCase() !== country));
  const correction = data?.clientId ? (
    <a
      className="underline"
      href={`/dashboard/clienti/${encodeURIComponent(data.clientId)}`}
      target="_blank"
      rel="noopener noreferrer"
    >
      pagina clientului → Asociere SAGA
    </a>
  ) : null;
  return (
    <section
      aria-busy={refreshing}
      aria-label="Client SAGA al facturii"
      className="rounded border bg-slate-50 p-3 text-sm"
    >
      {error && (
        <p role="alert" className="text-amber-800">
          {error}{" "}
          <button
            type="button"
            className="underline"
            disabled={refreshing}
            onClick={() => setRefresh((v) => v + 1)}
          >
            Reîncearcă
          </button>
        </p>
      )}
      {!data ? (
        <>
          {!error && (
            <InvoiceLoading>Se încarcă asocierea SAGA…</InvoiceLoading>
          )}
        </>
      ) : !data.clientId ? (
        <p className="text-amber-800">
          Clientul tichetului lipsește sau este ambiguu. Corectează clientul din
          tichet.
        </p>
      ) : !data.link?.active ? (
        <p>
          Client neasociat cu SAGA. Asocierea se completează în {correction}.
        </p>
      ) : data.issues.length || !data.entry ? (
        <p className="text-amber-800">
          Asocierea SAGA necesită reconfirmare. Verifică datele fiscale și
          asocierea în {correction}.
        </p>
      ) : fiscalDifference ? (
        <p className="text-amber-800">
          Datele fiscale din ciornă diferă de clientul FOM. Verifică
          beneficiarul și {correction}.
        </p>
      ) : (
        <p className="break-words">
          {data.clientName || data.entry.name}
          {data.taxId ? ` · ${data.taxId}` : ""} · Asociat SAGA{" "}
          {data.entry.code}
        </p>
      )}
      {data && refreshing && (
        <InvoiceLoading>Se actualizează asocierea SAGA…</InvoiceLoading>
      )}
    </section>
  );
}
