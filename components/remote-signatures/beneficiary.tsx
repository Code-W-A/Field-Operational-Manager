"use client";
import { useEffect, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function BeneficiarySigning() {
  const [credentials, setCredentials] = useState<Record<string, string> | null>(
    null,
  );
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [pdf, setPdf] = useState(""),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [signature, setSignature] = useState("");
  const [accepted, setAccepted] = useState(false),
    [drawing, setDrawing] = useState(false),
    [ink, setInk] = useState(false);
  const lock = useRef(false),
    pad = useRef<SignatureCanvas | null>(null),
    area = useRef<HTMLDivElement>(null);
  const urls = useRef<string[]>([]);
  const call = async (action: string, input: any = {}, c = credentials) => {
    if (!c?.id || !c.token)
      throw new Error(
        "Linkul este incomplet. Deschide linkul complet din email.",
      );
    const response = await fetch("/api/remote-signatures/public", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...c, ...input, action }),
      cache: "no-store",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok) {
      const e = await response.json();
      throw new Error(e.error || "Cererea nu a putut fi confirmată.");
    }
    const result =
      action === "pdf" ? await response.blob() : await response.json();
    const activeLink = new URLSearchParams(window.location.hash.slice(1));
    if (activeLink.get("id") !== c.id || activeLink.get("token") !== c.token)
      throw new DOMException("Link changed", "AbortError");
    return result;
  };
  useEffect(() => {
    let generation = 0;
    const load = () => {
      const current = ++generation;
      const c = Object.fromEntries(
        new URLSearchParams(window.location.hash.slice(1)),
      );
      setCredentials(c);
      setData(null);
      setPdf("");
      setError("");
      setSignature("");
      setDrawing(false);
      setAccepted(false);
      call("view", {}, c)
        .then((d) => {
          if (current === generation) {
            setData(d);
            setName(d.beneficiaryName || "");
          }
        })
        .catch((e) => {
          if (current === generation) setError(e.message);
        });
    };
    load();
    window.addEventListener("hashchange", load);
    return () => {
      generation++;
      window.removeEventListener("hashchange", load);
      urls.current.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);
  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    call("pdf")
      .then((blob) => {
        if (!cancelled) {
          const url = URL.createObjectURL(blob);
          urls.current.push(url);
          setPdf(url);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [data?.id, data?.status, credentials?.token]);
  useEffect(() => {
    if (!drawing || !area.current) return;
    const resize = () => {
      const p = pad.current;
      if (!p) return;
      const canvas = p.getCanvas(),
        width = area.current!.clientWidth,
        height = 260,
        ratio = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width === Math.round(width * ratio)) return;
      // Preserve the existing ink as an image fitted proportionally after rotation.
      const image = p.isEmpty() ? "" : canvas.toDataURL(),
        oldW = canvas.width,
        oldH = canvas.height;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      canvas.getContext("2d")!.scale(ratio, ratio);
      p.clear();
      if (image) {
        const scale = Math.min(width / oldW, height / oldH);
        p.fromDataURL(image, {
          ratio,
          width: oldW * scale,
          height: oldH * scale,
        });
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(area.current);
    resize();
    return () => observer.disconnect();
  }, [drawing]);
  const run = async (fn: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(
        e instanceof Error
          ? e.message
          : "Operația nu a fost confirmată. Reîncearcă.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const signed = data?.status === "signed",
    confirming = credentials?.phase === "confirm";
  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-8 space-y-5 pb-12">
      <h1 className="text-2xl font-semibold">
        {signed
          ? "Document semnat"
          : confirming
            ? "Confirmă semnătura"
            : "Verifică și semnează documentul"}
      </h1>
      {error && (
        <p
          role="alert"
          className="rounded border border-red-300 bg-red-50 p-3 text-red-700 break-words"
        >
          {error}
        </p>
      )}
      {!data && !error && <p role="status">Se încarcă documentul…</p>}
      {data && (
        <>
          <p>
            {signed
              ? "Semnarea a fost finalizată. Poți descărca documentul de mai jos."
              : "Citește documentul înainte de semnare. Semnătura va fi aplicată numai acestei versiuni."}
          </p>
          {pdf ? (
            <>
              <a
                className="block underline text-teal-800"
                href={pdf}
                target="_blank"
                rel="noreferrer"
              >
                Deschide documentul PDF
              </a>
              <a
                className="block underline text-teal-800"
                href={pdf}
                download="Document.pdf"
              >
                Descarcă documentul PDF
              </a>
              <iframe
                title="Documentul pentru semnare"
                src={pdf}
                className="w-full h-[400px] rounded border"
              />
            </>
          ) : (
            <p>Se pregătește PDF-ul…</p>
          )}
          {data.hasRevision && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const blob = await call("pdf", { revision: true }),
                    url = URL.createObjectURL(blob);
                  urls.current.push(url);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "Fisa_revizie.pdf";
                  a.click();
                })
              }
            >
              Descarcă fișa de revizie
            </Button>
          )}
          {signed ? (
            <p role="status">
              {data.delivery.final?.status === "sent"
                ? "Emailul cu documentul a fost predat serviciului de trimitere."
                : data.delivery.final?.status === "simulated"
                  ? "Emailul a fost simulat în mediul de test."
                  : "Documentul este semnat. Trimiterea emailului nu este încă confirmată; poți descărca PDF-ul."}
            </p>
          ) : confirming ? (
            <>
              <p>
                Semnatar: <strong>{data.beneficiaryName}</strong>
              </p>
              <img
                src={data.signature}
                alt="Semnătura pentru confirmare"
                className="w-full max-h-60 object-contain border rounded bg-white"
              />
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                  disabled={busy}
                />
                {data.declaration}
              </label>
              <Button
                disabled={!accepted || busy || !pdf}
                className="h-auto whitespace-normal w-full p-4"
                onClick={() =>
                  run(async () => {
                    setData(await call("confirm", { accepted: true }));
                  })
                }
              >
                Confirm semnătura și finalizez
              </Button>
              <p className="text-sm text-muted-foreground">
                Dacă aceasta nu este semnătura ta, nu confirma. Revino la primul
                email pentru a o reface sau contactează expeditorul.
              </p>
            </>
          ) : data.status === "awaiting_confirmation" &&
            !drawing &&
            !signature ? (
            <>
              <p role="status">
                Semnătura ta este importantă.{" "}
                {data.delivery.confirm?.status === "sent"
                  ? "Ți-am trimis al doilea link prin email."
                  : data.delivery.confirm?.status === "simulated"
                    ? "Emailul de confirmare a fost simulat în mediul de test."
                    : "Trimiterea celui de-al doilea email nu este confirmată."}{" "}
                Deschide-l și confirmă semnătura pentru a încheia procesul.
              </p>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    setData(await call("resendConfirmation"));
                  })
                }
              >
                Retrimite emailul de confirmare
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setDrawing(true);
                  setInk(false);
                  setAccepted(false);
                }}
              >
                Refă semnătura
              </Button>
            </>
          ) : (
            <>
              <label className="block">
                Numele beneficiarului
                <Input
                  value={name}
                  maxLength={200}
                  disabled={busy}
                  onChange={(e) => {
                    setName(e.target.value);
                    setAccepted(false);
                  }}
                  autoComplete="name"
                />
              </label>
              <label className="block">
                Confirmă adresa la care ai primit solicitarea
                <Input
                  type="email"
                  value={email}
                  maxLength={254}
                  disabled={busy}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </label>
              {drawing ? (
                <div className="space-y-3">
                  <div
                    ref={area}
                    className="border rounded bg-white touch-none overflow-hidden"
                  >
                    <SignatureCanvas
                      ref={pad}
                      clearOnResize={false}
                      onEnd={() => setInk(!pad.current?.isEmpty())}
                      canvasProps={{
                        style: {
                          width: "100%",
                          height: 260,
                          touchAction: "none",
                        },
                        "aria-label": "Desenează semnătura",
                      }}
                    />
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      variant="outline"
                      onClick={() => {
                        pad.current?.clear();
                        setInk(false);
                      }}
                    >
                      Șterge
                    </Button>
                    <Button
                      disabled={!ink}
                      onClick={() => {
                        setSignature(pad.current!.toDataURL("image/png"));
                        setDrawing(false);
                        setAccepted(false);
                      }}
                    >
                      Folosește semnătura
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <Button
                    disabled={busy}
                    variant="outline"
                    onClick={() => {
                      setDrawing(true);
                      setInk(false);
                      setAccepted(false);
                    }}
                  >
                    {signature ? "Refă semnătura" : "Adaugă semnătura"}
                  </Button>
                  {signature && (
                    <img
                      alt="Previzualizarea semnăturii"
                      src={signature}
                      className="w-full max-h-60 object-contain rounded border bg-white"
                    />
                  )}
                </>
              )}
              {!!signature && !drawing && (
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={accepted}
                    disabled={busy}
                    onChange={(e) => setAccepted(e.target.checked)}
                  />
                  {data.declaration}
                </label>
              )}
              <Button
                className="w-full h-auto whitespace-normal p-4"
                disabled={
                  busy ||
                  drawing ||
                  !signature ||
                  !accepted ||
                  !name.trim() ||
                  !email.trim() ||
                  !pdf
                }
                onClick={() =>
                  run(async () => {
                    setData(
                      await call("submit", {
                        signature,
                        beneficiaryName: name,
                        email,
                        accepted: true,
                      }),
                    );
                    setSignature("");
                    setAccepted(false);
                  })
                }
              >
                Trimite linkul pentru confirmarea finală
              </Button>
            </>
          )}
          <p className="text-xs text-muted-foreground break-all">
            Referință document: {data.documentHash}
          </p>
        </>
      )}
    </main>
  );
}
