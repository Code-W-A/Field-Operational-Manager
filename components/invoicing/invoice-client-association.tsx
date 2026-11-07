"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { normalizeTaxId, type ClientAssociation } from "@/lib/saga/clients";
export function InvoiceClientAssociation({
  workId,
  beneficiaryCui,
}: {
  workId: string;
  beneficiaryCui: string;
}) {
  const { user } = useAuth();
  const [data, setData] = useState<ClientAssociation | null>(null),
    [error, setError] = useState("");
  async function load() {
    setError("");
    try {
      const token = await user?.getIdToken();
      const r = await fetch(
        `/api/lucrari/${encodeURIComponent(workId)}/invoice-draft/client-association`,
        {
          cache: "no-store",
          headers: { Authorization: `Bearer ${token || ""}` },
        },
      );
      const value = await r.json();
      if (!r.ok)
        throw new Error(value.error || "Asocierea nu poate fi consultată.");
      if (!Array.isArray(value.issues))
        throw new Error("Asocierea nu poate fi consultată momentan.");
      setData(value);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, [workId, user?.uid]);
  const country = data?.link?.country || "";
  const changed =
    data?.link &&
    normalizeTaxId(beneficiaryCui, country) !==
      normalizeTaxId(data.taxId, country);
  return (
    <section
      aria-label="Client SAGA al facturii"
      className="space-y-2 rounded border bg-slate-50 p-3 text-sm"
    >
      <h4 className="font-medium">Client SAGA al facturii</h4>
      {error && (
        <p className="text-amber-800">{error} Ciorna poate fi salvată.</p>
      )}
      {data?.entry && (
        <p className="break-words">
          {data.entry.code} · {data.entry.name} · {data.entry.country} ·
          CUI/CIF: {data.entry.taxId || "lipsește"}
        </p>
      )}
      {data?.issues.map((issue) => (
        <p key={issue} className="text-amber-800">
          {issue}
        </p>
      ))}
      {changed && (
        <p className="text-amber-800">
          CUI/CIF-ul beneficiarului din ciornă diferă de clientul FOM asociat.
          Verifică identitatea fiscală înainte de facturare.
        </p>
      )}
      {data?.clientId && (
        <a
          className="inline-block underline"
          href={`/dashboard/clienti/${encodeURIComponent(data.clientId)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Consultă asocierea clientului FOM
        </a>
      )}
      <div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void load()}
        >
          Actualizează clientul SAGA
        </Button>
      </div>
      <p className="text-xs text-slate-500">
        Referință din export. Datele beneficiarului din ciornă se editează
        separat.
      </p>
    </section>
  );
}
