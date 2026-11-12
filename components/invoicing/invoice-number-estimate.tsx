"use client";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
type Estimate = {
  issuer?: { uid: string; name: string; prefix: string } | null;
  number: string | null;
  reserved: boolean;
  reason: string;
};
export function InvoiceNumberEstimate({ workId }: { workId: string }) {
  const { user } = useAuth();
  const currentUser = useRef(user);
  currentUser.current = user;
  const [data, setData] = useState<Estimate | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let generation = 0;
    let disposed = false;
    async function load() {
      const request = ++generation;
      setError("");
      try {
        const token = await currentUser.current?.getIdToken();
        const response = await fetch(
          `/api/lucrari/${encodeURIComponent(workId)}/invoice-draft/number`,
          {
            cache: "no-store",
            headers: { Authorization: `Bearer ${token || ""}` },
          },
        );
        const value = await response.json();
        if (
          !response.ok ||
          typeof value.reserved !== "boolean" ||
          typeof value.reason !== "string" ||
          (value.number !== null && typeof value.number !== "string")
        )
          throw new Error("Numărul facturii nu poate fi încărcat momentan.");
        if (!disposed && request === generation) setData(value);
      } catch {
        if (disposed || request !== generation) return;
        setData(null);
        setError("Numărul facturii nu poate fi încărcat momentan.");
      }
    }
    setData(null);
    void load();
    window.addEventListener("focus", load);
    return () => {
      disposed = true;
      window.removeEventListener("focus", load);
    };
  }, [workId, user?.uid]);
  const configurationMissing =
    data &&
    !data.number &&
    (!data.reason || data.reason.startsWith("Lipsește profilul de facturare"));
  return (
    <section
      aria-label="Numărul facturii"
      className="space-y-2 rounded border p-3 text-sm"
    >
      {error ? (
        <p className="text-amber-800">{error}</p>
      ) : data?.number ? (
        <p>
          Număr factură · <strong className="break-words">{data.number}</strong>
        </p>
      ) : configurationMissing ? (
        <p>
          Configurează numerotarea din{" "}
          <a
            className="underline"
            href="/dashboard/utilizatori"
            target="_blank"
            rel="noopener noreferrer"
          >
            Utilizatori → Editează utilizatorul → Facturare SAGA
          </a>
          .
        </p>
      ) : data?.reason ? (
        <p className="text-amber-800">{data.reason}</p>
      ) : (
        <p className="text-muted-foreground">Se încarcă numărul facturii…</p>
      )}
    </section>
  );
}
