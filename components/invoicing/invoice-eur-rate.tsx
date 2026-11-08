"use client";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { eurReferenceText, type EurReference } from "@/lib/invoicing/eur-rate";
export function InvoiceEurRate({
  workId,
  date,
  reference,
  readOnly,
  onProposal,
  onSelect,
}: {
  workId: string;
  date: string;
  reference?: EurReference;
  readOnly: boolean;
  onProposal: (r: EurReference | undefined) => void;
  onSelect: (r: EurReference) => void;
}) {
  const { user } = useAuth(),
    [proposal, setProposal] = useState<EurReference | undefined>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [omitConfirm, setOmitConfirm] = useState(false);
  const sequence = useRef(0),
    stored = reference?.requestedDate === date ? reference : undefined;
  async function load(automatic = false) {
    const generation = ++sequence.current;
    setBusy(true);
    setError("");
    setProposal(undefined);
    setOmitConfirm(false);
    if (!stored) onProposal(undefined);
    try {
      const token = await user?.getIdToken(),
        r = await fetch(
          `/api/lucrari/${encodeURIComponent(workId)}/invoice-draft/eur-rate?${new URLSearchParams({ date })}`,
          {
            cache: "no-store",
            headers: { Authorization: `Bearer ${token || ""}` },
          },
        ),
        data = await r.json();
      if (!r.ok)
        throw new Error(data.error || "Cursul EUR nu poate fi preluat.");
      if (!data.reference || data.reference.requestedDate !== date)
        throw new Error(
          "Nu există un curs EUR înregistrat pentru această dată.",
        );
      if (generation !== sequence.current) return;
      setProposal(data.reference);
      if (automatic && !stored) onProposal(data.reference);
    } catch (e) {
      if (generation === sequence.current) setError((e as Error).message);
    } finally {
      if (generation === sequence.current) setBusy(false);
    }
  }
  useEffect(() => {
    setProposal(undefined);
    setError("");
    setOmitConfirm(false);
    onProposal(undefined);
    if (!readOnly && !stored && date) void load(true);
    return () => {
      sequence.current++;
    };
  }, [workId, date, user?.uid, readOnly, JSON.stringify(reference)]);
  const shown = stored || proposal;
  return (
    <section
      aria-label="Curs EUR informativ"
      className="space-y-2 rounded border bg-slate-50 p-3 text-sm"
    >
      <h4 className="font-semibold">Curs EUR informativ</h4>
      <p>Factura și toate calculele rămân în RON.</p>
      {shown?.status === "available" && (
        <>
          <p className="break-words font-medium">
            1 EUR = {shown.value} RON — referință informativă
          </p>
          <p>
            Sursă: BNR · Publicat: {shown.rateDate} · Pentru data facturii:{" "}
            {shown.requestedDate}
          </p>
          <p>Preluat: {shown.fetchedAt}</p>
          {!stored && <p>Curs propus — se păstrează la salvarea ciornei.</p>}
        </>
      )}
      {shown?.status === "omitted" && (
        <p>
          Fără curs EUR — omitere confirmată
          {shown.confirmedAt
            ? ` la ${shown.confirmedAt}, de ${shown.confirmedBy}`
            : ""}
          .
        </p>
      )}
      {!shown && !busy && !error && (
        <p>
          {readOnly
            ? "Curs EUR neînregistrat la pregătire."
            : "Alege data facturii pentru preluarea cursului."}
        </p>
      )}
      {busy && <p>Se preia cursul BNR… Ciorna poate fi salvată separat.</p>}
      {stored && proposal && (
        <p>
          Propunere:{" "}
          {proposal.status === "available"
            ? `1 EUR = ${proposal.value} RON · publicat ${proposal.rateDate} · BNR · preluat ${proposal.fetchedAt}`
            : "fără curs EUR"}
        </p>
      )}
      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || !date}
            onClick={() => load(false)}
          >
            Actualizează cursul EUR
          </Button>
          {proposal && (
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => {
                onSelect(proposal);
                onProposal(undefined);
                setProposal(undefined);
              }}
            >
              {stored
                ? "Folosește cursul actualizat"
                : "Păstrează cursul în ciornă"}
            </Button>
          )}
        </div>
      )}
      {error && (
        <>
          <p role="alert" className="text-amber-800">
            {error}{" "}
            {stored
              ? "Referința salvată a fost păstrată."
              : "Nu a fost folosit un curs zero."}
          </p>
          {!readOnly && (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setOmitConfirm(true)}
                disabled={!date || busy}
              >
                Continuă fără curs EUR
              </Button>
              {omitConfirm && (
                <div
                  role="group"
                  aria-label="Confirmare fără curs EUR"
                  className="space-y-2 rounded border p-2"
                >
                  <p>
                    Confirm că factura va fi pregătită fără curs EUR informativ.
                    Confirmarea se păstrează la salvare.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      onSelect({ status: "omitted", requestedDate: date });
                      onProposal(undefined);
                      setProposal(undefined);
                      setOmitConfirm(false);
                      setError("");
                    }}
                  >
                    Confirmă continuarea fără curs EUR
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setOmitConfirm(false)}
                  >
                    Renunță
                  </Button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
