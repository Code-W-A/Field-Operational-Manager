"use client";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
type Estimate = {
  issuer?: { uid: string; name: string; prefix: string } | null;
  number: string | null;
  reserved: boolean;
  reason: string;
};
export function InvoiceNumberEstimate({ workId }: { workId: string }) {
  const { user } = useAuth();
  const [data, setData] = useState<Estimate | null>(null),
    [error, setError] = useState("");
  const requests = useRef(0);
  async function load() {
    const generation = ++requests.current;
    setError("");
    try {
      const token = await user?.getIdToken();
      const r = await fetch(
        `/api/lucrari/${encodeURIComponent(workId)}/invoice-draft/number`,
        {
          cache: "no-store",
          headers: { Authorization: `Bearer ${token || ""}` },
        },
      );
      const value = await r.json();
      if (
        !r.ok ||
        typeof value.reserved !== "boolean" ||
        typeof value.reason !== "string" ||
        (value.number !== null && typeof value.number !== "string")
      )
        throw new Error(value.error || "Numărul estimat nu este disponibil.");
      if (generation === requests.current) setData(value);
    } catch (e) {
      if (generation !== requests.current) return;
      setData(null);
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    setData(null);
    void load();
    return () => {
      requests.current++;
    };
  }, [workId, user?.uid]);
  return (
    <section
      aria-label="Numărul facturii"
      className="space-y-2 rounded border p-3 text-sm"
    >
      <h4 className="font-medium">
        {data?.reserved ? "Număr alocat" : "Număr estimat — nerezervat"}
      </h4>
      {data?.issuer && (
        <p>
          Utilizator emitent: {data.issuer.name} · Serie: {data.issuer.prefix}
        </p>
      )}
      {data?.number && (
        <p className="break-words font-semibold">{data.number}</p>
      )}
      {data?.reason && <p className="text-amber-800">{data.reason}</p>}
      {data && !data.number && !data.reason && (
        <p>
          Numerotarea se configurează de admin din Utilizatori → Editează
          utilizatorul → Facturare SAGA.
        </p>
      )}
      {error && (
        <p className="text-amber-800">{error} Ciorna poate fi salvată.</p>
      )}
      {!data?.reserved && (
        <p className="text-xs text-muted-foreground">
          Estimarea se poate schimba. Deschiderea și salvarea ciornei nu rezervă
          numărul.
        </p>
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => void load()}
      >
        Actualizează numărul estimat
      </Button>
    </section>
  );
}
