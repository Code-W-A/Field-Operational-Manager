"use client";
import {
  InvoiceSagaArticle,
  InvoiceCommercialActivation,
} from "./invoice-saga-article";

import { InvoiceEurRate } from "./invoice-eur-rate";
import type { EurReference } from "@/lib/invoicing/eur-rate";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  InvoiceCommercialApply,
  InvoiceCommercialSelector,
  useCommercialTicketRequest,
} from "./invoice-commercial";
import { dueFromTerm } from "@/lib/invoicing/commercial";
import { InvoiceIssuerSettings } from "@/components/settings/invoice-issuer-settings";
import { InvoiceFinalizationPanel } from "./invoice-finalization-panel";
import { InvoiceNumberEstimate } from "./invoice-number-estimate";
import { InvoiceClientAssociation } from "./invoice-client-association";
import { InvoiceSagaFields } from "./invoice-saga-fields";
import { stockKey, type SagaCatalog } from "@/lib/saga/catalog";
import { createPortal } from "react-dom";
import {
  FilePenLine,
  GripHorizontal,
  Minimize2,
  Move,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import {
  calculateInvoiceTotals,
  invoiceContent,
  invoiceEditReason,
  invoiceSourceLabel,
  type InvoiceContent,
  type InvoiceDraft,
  type InvoiceDraftResponse,
} from "@/lib/invoicing/draft";

const money = (cents: number) =>
  new Intl.NumberFormat("ro-RO", { style: "currency", currency: "RON" }).format(
    cents / 100,
  );
const fieldNames = {
  name: "Denumire beneficiar",
  cui: "CUI/CIF",
  registration: "Nr. registrul comerțului",
  address: "Adresă fiscală",
  bank: "Bancă",
  iban: "Cont bancar",
  phone: "Telefon beneficiar",
  email: "Email beneficiar",
} as const;
type Position = { x: number; y: number };
function clamp(p: Position) {
  return {
    x: Math.max(
      8,
      Math.min(
        p.x,
        Math.max(
          8,
          window.innerWidth - Math.min(840, window.innerWidth - 32) - 8,
        ),
      ),
    ),
    y: Math.max(8, Math.min(p.y, Math.max(8, window.innerHeight - 260))),
  };
}
function sourceKey(d: InvoiceDraft) {
  return JSON.stringify({
    ...invoiceContent(d),
    references: d.references,
    source: d.source,
  });
}

export function InvoiceDraftSection({
  workId,
  work,
}: {
  workId: string;
  work: Record<string, any>;
}) {
  const { user, userData } = useAuth();
  const [response, setResponse] = useState<InvoiceDraftResponse | null>(null);
  const [draft, setDraft] = useState<InvoiceDraft | null>(null);
  const [baseline, setBaseline] = useState<InvoiceDraft | null>(null);
  const [open, setOpen] = useState(false),
    [minimized, setMinimized] = useState(false);
  const [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [busyAction, setBusyAction] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [confirm, setConfirm] = useState<"close" | "source" | "reload" | null>(
    null,
  );
  const [comparison, setComparison] = useState<InvoiceDraft | null>(null);
  const [refreshSource, setRefreshSource] = useState(false);
  const [approveDiscount, setApproveDiscount] = useState(false);
  const [eurProposal, setEurProposal] = useState<EurReference | undefined>();
  const [narrow, setNarrow] = useState(true),
    [position, setPosition] = useState<Position>({ x: 16, y: 80 });
  const drag = useRef<(Position & { startX: number; startY: number }) | null>(
    null,
  );
  const panel = useRef<HTMLElement>(null);
  const saveLock = useRef(false);
  const owner = useRef(workId);
  owner.current = workId;
  const dirty =
    !!draft &&
    (!baseline || sourceKey(draft) !== sourceKey(baseline) || refreshSource);
  const localReason = invoiceEditReason(work);
  const reason = localReason || response?.reason || "";
  const readOnly = !!reason || response?.canEdit !== true;
  const previousReason = useRef(localReason);
  async function request(method = "GET", body?: unknown, source = false) {
    const token = await user?.getIdToken();
    const r = await fetch(
      `/api/lucrari/${encodeURIComponent(workId)}/invoice-draft${source ? "?source=1" : ""}`,
      {
        method,
        cache: "no-store",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      },
    );
    const data = await r.json().catch(() => {
      throw new Error(
        "Serverul nu a putut răspunde. Modificările locale sunt păstrate; reîncearcă.",
      );
    });
    if (!r.ok)
      throw Object.assign(
        new Error(data.error || "Ciorna nu a putut fi încărcată."),
        { code: data.code, status: r.status },
      );
    return data as InvoiceDraftResponse;
  }
  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await request();
      if (owner.current !== workId) return false;
      setResponse(data);
      setDraft(data.draft);
      setBaseline(data.draft);
      setApproveDiscount(false);
      setEurProposal(undefined);
      setRefreshSource(false);
      setComparison(null);
      setNotice("");
      return !!data.draft;
    } catch (e) {
      if (owner.current === workId) setError((e as Error).message);
      return false;
    } finally {
      if (owner.current === workId) setLoading(false);
    }
  }
  async function openEditor() {
    // A closed, clean editor starts with the latest saved draft/source data.
    // Restoring a minimized editor always keeps the current local values.
    if (open || dirty || (await load())) {
      setOpen(true);
      setMinimized(false);
    }
  }
  useEffect(() => {
    void load();
  }, [workId, user?.uid]); // Account/ticket scopes do not share an editor.
  useEffect(() => {
    if (previousReason.current === localReason) return;
    previousReason.current = localReason;
    if (!open && !dirty) {
      void load();
      return;
    }
    void request()
      .then((data) => setResponse(data))
      .catch((e) => setError(e.message));
  }, [localReason]);
  useEffect(() => {
    const resize = () => {
      setNarrow(window.innerWidth < 768);
      setPosition((p) => clamp(p));
    };
    resize();
    setPosition(clamp({ x: window.innerWidth - 856, y: 80 }));
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const prevent = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  useEffect(() => {
    if (open && !minimized) panel.current?.focus({ preventScroll: true });
  }, [open, minimized]);
  function close() {
    if (saving || busyAction) return;
    if (dirty) setConfirm("close");
    else {
      setOpen(false);
      setMinimized(false);
      setConfirm(null);
    }
  }
  async function save(closeAfter = false) {
    if (!draft || readOnly || saveLock.current) return;
    saveLock.current = true;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const data = await request("PUT", {
        content: {
          ...invoiceContent(draft),
          ...(!draft.eurReference && eurProposal?.requestedDate === draft.date
            ? { eurReference: eurProposal }
            : {}),
        },
        expectedRevision: draft.revision,
        refreshSource,
        approveDiscount,
      });
      setResponse(data);
      setDraft(data.draft);
      setBaseline(data.draft);
      setApproveDiscount(false);
      setEurProposal(undefined);
      setRefreshSource(false);
      setComparison(null);
      setConfirm(null);
      setNotice("Ciornă salvată.");
      if (closeAfter) {
        setOpen(false);
        setMinimized(false);
      }
      return data.draft as InvoiceDraft;
    } catch (e) {
      setError((e as Error).message);
      if ((e as { code?: string }).code === "REVISION_CONFLICT") {
        try {
          const latest = await request();
          setComparison(latest.draft);
          setResponse(latest);
        } catch {
          /* Keep the local form, including on a failed comparison read. */
        }
      }
      if ((e as { code?: string }).code === "DRAFT_READ_ONLY") {
        try {
          setResponse(await request());
        } catch {
          /* Local edits stay available. */
        }
      }
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }
  async function replace(action: "source" | "reload") {
    setBusyAction(true);
    setError("");
    try {
      const data = await request("GET", undefined, action === "source");
      if (action === "source" && !data.canEdit) {
        setResponse(data);
        throw new Error(data.reason);
      }
      if (
        action === "source" &&
        draft &&
        data.draft?.revision !== draft.revision
      ) {
        const latest = await request();
        setComparison(latest.draft);
        setResponse(latest);
        setConfirm(null);
        throw new Error(
          "Ciorna a fost salvată de alt operator. Compară versiunea salvată înainte de a relua datele.",
        );
      }
      setDraft(data.draft);
      setResponse(data);
      setComparison(null);
      setConfirm(null);
      if (action === "source") {
        setRefreshSource(true);
        setNotice(
          "Datele au fost reluate din tichet. Salvează ciorna pentru a le păstra.",
        );
      } else {
        setBaseline(data.draft);
        setApproveDiscount(false);
        setEurProposal(undefined);
        setRefreshSource(false);
        setNotice("Versiunea salvată a fost încărcată.");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyAction(false);
    }
  }
  function pointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (narrow || e.button !== 0 || (e.target as HTMLElement).closest("button"))
      return;
    drag.current = { ...position, startX: e.clientX, startY: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  const patch = (content: Partial<InvoiceContent>) => {
    setDraft((d) =>
      d
        ? {
            ...d,
            ...content,
            ...(content.date !== undefined && content.date !== d.date
              ? { eurReference: undefined }
              : {}),
          }
        : null,
    );
    setNotice("");
  };
  let totals = draft?.totals,
    numericError = "";
  if (draft) {
    try {
      totals = calculateInvoiceTotals(draft);
    } catch (e) {
      numericError = (e as Error).message;
    }
  }
  const panelContent =
    open && draft && !minimized ? (
      <section
        ref={panel}
        role="dialog"
        aria-modal="false"
        aria-label="Ciorna facturii"
        tabIndex={-1}
        data-testid="invoice-panel"
        className={`${narrow ? "relative mt-4 w-full" : "fixed z-[90] max-h-[calc(100dvh-24px)] w-[840px] max-w-[calc(100vw-32px)]"} flex flex-col overflow-hidden rounded-xl border border-slate-300 bg-white text-slate-950 shadow-2xl outline-none`}
        style={
          narrow
            ? undefined
            : {
                left: position.x,
                top: position.y,
                maxHeight: `calc(100dvh - ${position.y + 12}px)`,
              }
        }
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            close();
          }
        }}
      >
        <div
          tabIndex={narrow ? undefined : 0}
          aria-label={narrow ? undefined : "Mută fereastra facturii"}
          className={`flex shrink-0 select-none items-center justify-between gap-2 border-b bg-slate-50 px-4 py-3 ${narrow ? "" : "touch-none cursor-move"}`}
          onPointerDown={pointerDown}
          onPointerMove={(e) => {
            const d = drag.current;
            if (d)
              setPosition(
                clamp({
                  x: d.x + e.clientX - d.startX,
                  y: d.y + e.clientY - d.startY,
                }),
              );
          }}
          onPointerUp={(e) => {
            drag.current = null;
            if (e.currentTarget.hasPointerCapture(e.pointerId))
              e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onKeyDown={(e) => {
            if (e.target !== e.currentTarget || narrow) return;
            const offsets: Record<string, Position> = {
              ArrowLeft: { x: -20, y: 0 },
              ArrowRight: { x: 20, y: 0 },
              ArrowUp: { x: 0, y: -20 },
              ArrowDown: { x: 0, y: 20 },
            };
            const d = offsets[e.key];
            if (d) {
              e.preventDefault();
              setPosition((p) => clamp({ x: p.x + d.x, y: p.y + d.y }));
            }
          }}
        >
          <div className="min-w-0 flex items-center gap-2 break-words">
            <GripHorizontal className="hidden h-5 w-5 text-slate-400 md:block" />
            <div>
              <h3 className="font-semibold">
                Ciornă factură · {draft.references.ticketNumber}
              </h3>
              <p className="text-xs text-slate-500">
                {readOnly
                  ? "Doar citire"
                  : dirty
                    ? "Modificări nesalvate"
                    : response?.saved
                      ? "Ciornă salvată"
                      : "Ciornă nouă"}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 gap-1">
            {!narrow && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Repoziționează factura"
                onClick={() =>
                  setPosition(clamp({ x: window.innerWidth - 856, y: 80 }))
                }
              >
                <Move className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              aria-label="Minimizează factura"
              onClick={() => setMinimized(true)}
            >
              <Minimize2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Închide factura"
              disabled={saving || busyAction}
              onClick={close}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div
          className={`space-y-4 p-4 ${narrow ? "" : "min-h-0 flex-1 overflow-auto"}`}
        >
          {reason && (
            <p className="rounded-md bg-amber-50 p-3 text-sm">{reason}</p>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-md bg-red-50 p-3 text-sm text-red-800"
            >
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="text-sm text-emerald-800">
              {notice}
            </p>
          )}
          {confirm && (
            <div
              role="group"
              aria-label="Confirmare în editor"
              className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-3"
            >
              <p className="text-sm">
                {confirm === "close"
                  ? "Ai modificări nesalvate. Salvezi ciorna înainte de închidere?"
                  : confirm === "source"
                    ? "Înlocuiești conținutul editorului cu datele actuale din tichet? Modificările locale vor fi înlocuite."
                    : "Înlocuiești modificările locale cu versiunea salvată?"}
              </p>
              <div className="flex flex-wrap gap-2">
                {confirm === "close" ? (
                  <>
                    <Button
                      size="sm"
                      disabled={saving || readOnly || !!numericError}
                      onClick={() => void save(true)}
                    >
                      Salvează și închide
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={saving}
                      onClick={() => {
                        setDraft(baseline);
                        setRefreshSource(false);
                        setOpen(false);
                        setMinimized(false);
                        setConfirm(null);
                        setError("");
                      }}
                    >
                      Renunță la modificări
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    disabled={busyAction}
                    onClick={() => void replace(confirm)}
                  >
                    Înlocuiește datele
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={saving || busyAction}
                  onClick={() => setConfirm(null)}
                >
                  Continuă editarea
                </Button>
              </div>
            </div>
          )}
          {comparison && (
            <details className="rounded-md border border-amber-300 p-3">
              <summary className="cursor-pointer font-medium">
                Compară versiunea salvată de{" "}
                {comparison.updatedBy?.name || "alt operator"}
              </summary>
              <div className="mt-4">
                <DraftForm
                  draft={comparison}
                  readOnly
                  onChange={() => {}}
                  prefix="comparison"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={() => setConfirm("reload")}
                >
                  Folosește versiunea salvată
                </Button>
              </div>
            </details>
          )}
          <div className="rounded-md bg-slate-50 p-3 text-sm">
            <p className="font-medium">
              {draft.references.workType} ·{" "}
              {invoiceSourceLabel(draft.source.kind)}
            </p>
            <p>
              {[draft.references.location, draft.references.locationAddress]
                .filter(Boolean)
                .join(" — ")}
            </p>
            <p>
              {[
                draft.references.contact,
                draft.references.phone,
                draft.references.email,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {draft.references.contract && (
              <p>Contract: {draft.references.contract}</p>
            )}
            {!!draft.references.equipment.length && (
              <p>Echipamente: {draft.references.equipment.join(", ")}</p>
            )}
            {draft.references.description && (
              <p className="mt-1 whitespace-pre-wrap">
                {draft.references.description}
              </p>
            )}
            {draft.references.author && (
              <p className="mt-1 text-xs text-slate-500">
                Autor tichet: {draft.references.author}
              </p>
            )}
          </div>
          {!!draft.source.issues.length && (
            <div className="space-y-1 rounded-md bg-amber-50 p-3 text-sm">
              {draft.source.issues.map((issue, i) => (
                <p key={i}>{issue}</p>
              ))}
            </div>
          )}
          <InvoiceNumberEstimate
            key={`number:${workId}:${user?.uid}:${readOnly}`}
            workId={workId}
          />
          <InvoiceClientAssociation
            commercial={!!draft.commercial || response?.commercialPolicy}
            key={`${workId}:${user?.uid}`}
            workId={workId}
            beneficiaryCui={draft.beneficiary.cui}
            beneficiaryCountry={draft.beneficiary.country}
            onCountryProposal={
              readOnly || saving || busyAction
                ? undefined
                : (country) =>
                    patch({ beneficiary: { ...draft.beneficiary, country } })
            }
          />
          {!readOnly && (
            <InvoiceCommercialActivation
              readOnly={saving || busyAction}
              onBusy={setBusyAction}
              onActivated={() =>
                setResponse((r) => (r ? { ...r, commercialPolicy: true } : r))
              }
            />
          )}
          {(response?.commercialPolicy || draft.commercial) && (
            <InvoiceCommercialApply
              draft={draft}
              readOnly={readOnly || saving || busyAction}
              onApplied={load}
              onBusy={setBusyAction}
            />
          )}
          <DraftForm
            onBusy={setBusyAction}
            approveDiscount={approveDiscount}
            onApproveDiscount={setApproveDiscount}
            draft={draft}
            readOnly={readOnly || saving || busyAction}
            onChange={patch}
            prefix="invoice"
          />
          <InvoiceEurRate
            workId={workId}
            date={draft.date}
            reference={draft.eurReference}
            readOnly={readOnly || saving || busyAction}
            onProposal={setEurProposal}
            onSelect={(eurReference) => patch({ eurReference })}
          />
          {!readOnly && (
            <InvoiceIssuerSettings
              inline
              canEdit={userData?.role === "admin"}
              readOnly={saving || busyAction}
              onBusy={setBusyAction}
            />
          )}
          <InvoiceFinalizationPanel
            key={`finalization:${workId}:${user?.uid}`}
            workId={workId}
            draft={draft}
            onSaveBeforePreview={async () => {
              if (dirty || draft.revision === 0 || !draft.eurReference)
                return save();
              return draft;
            }}
            dirty={dirty}
            readOnly={readOnly || saving}
            onBusy={setBusyAction}
            onFrozen={() =>
              setResponse((r) =>
                r
                  ? {
                      ...r,
                      canEdit: false,
                      reason:
                        "Documentul XML este pregătit în FOM. Ciorna poate fi doar consultată.",
                    }
                  : r,
              )
            }
            onPrepared={async () => {
              setResponse((r) =>
                r
                  ? {
                      ...r,
                      canEdit: false,
                      reason:
                        "Documentul XML este pregătit în FOM. Ciorna poate fi doar consultată.",
                    }
                  : r,
              );
              return load();
            }}
          />
          {numericError && (
            <p role="alert" className="text-sm text-red-700">
              {numericError}
            </p>
          )}
          {!numericError && totals && (
            <div
              className="ml-auto max-w-sm space-y-1 rounded-lg bg-slate-50 p-4 text-sm"
              aria-live="polite"
            >
              <p className="flex justify-between gap-3">
                <span>Valoare fără TVA</span>
                <strong>{money(totals.subtotalCents)}</strong>
              </p>
              <p className="flex justify-between gap-3">
                <span>Reducere</span>
                <span>−{money(totals.discountCents)}</span>
              </p>
              <p className="flex justify-between gap-3">
                <span>Bază după reducere</span>
                <span>{money(totals.baseCents)}</span>
              </p>
              <p className="flex justify-between gap-3">
                <span>TVA</span>
                <span>{money(totals.vatCents)}</span>
              </p>
              {totals.vatGroups?.map((g) => (
                <p key={g.rate}>
                  TVA {g.rate}% · bază {money(g.baseCents)} · TVA{" "}
                  {money(g.vatCents)}
                </p>
              ))}
              <p className="flex justify-between gap-3 border-t pt-2 text-base">
                <span>Total ciornă</span>
                <strong data-testid="invoice-total">
                  {money(totals.totalCents)}
                </strong>
              </p>
              {totals.incomplete && (
                <p className="pt-2 text-amber-800">
                  Total parțial: unele poziții sau procente sunt necompletate.
                </p>
              )}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t bg-white p-3">
          <Button
            size="sm"
            variant="outline"
            disabled={readOnly || saving || busyAction}
            onClick={() => setConfirm("source")}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Reia datele din tichet
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={readOnly || saving || busyAction || !!numericError}
            onClick={() => void save()}
          >
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Se salvează…" : "Salvează ciorna"}
          </Button>
        </div>
      </section>
    ) : null;
  return (
    <>
      <div
        className="mb-4 rounded-md border border-emerald-200 bg-emerald-50/50 p-4"
        data-testid="invoice-draft-section"
      >
        <h4 className="mb-3 flex items-center gap-2 text-base font-semibold text-emerald-950">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-700 text-sm text-white">
            F
          </span>
          Facturare
        </h4>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={loading || !draft || (!response?.saved && !!reason)}
            onClick={() => void openEditor()}
          >
            <FilePenLine className="mr-2 h-4 w-4" />
            {loading
              ? "Se verifică ciorna…"
              : response?.saved
                ? reason
                  ? "Vezi ciorna"
                  : "Continuă ciorna"
                : "Începe factura"}
          </Button>
          <span className="text-xs text-slate-600">
            Ciornă și document XML în FOM
          </span>
        </div>
        {reason && <p className="mt-2 text-sm text-slate-600">{reason}</p>}
        {!open && error && (
          <div className="mt-2 flex items-center gap-2 text-sm">
            <span role="alert" className="text-red-700">
              {error}
            </span>
            <Button size="sm" variant="ghost" onClick={() => void load()}>
              Reîncearcă
            </Button>
          </div>
        )}
        {notice && !open && (
          <p role="status" className="mt-2 text-sm text-emerald-800">
            {notice}
          </p>
        )}
      </div>
      {narrow
        ? panelContent
        : typeof document !== "undefined" && panelContent
          ? createPortal(panelContent, document.body)
          : null}
      {open && minimized && (
        <Button
          className="fixed bottom-4 right-4 z-[90] shadow-xl"
          onClick={() => setMinimized(false)}
        >
          Continuă ciorna{dirty ? " · nesalvată" : ""}
        </Button>
      )}
    </>
  );
}

function DraftForm({
  draft,
  readOnly,
  onChange,
  prefix,
  approveDiscount = false,
  onApproveDiscount,
  onBusy,
}: {
  onBusy?: (v: boolean) => void;
  approveDiscount?: boolean;
  onApproveDiscount?: (v: boolean) => void;
  draft: InvoiceDraft;
  readOnly: boolean;
  onChange: (patch: Partial<InvoiceContent>) => void;
  prefix: string;
}) {
  const { user } = useAuth();
  const commercialRequest = useCommercialTicketRequest(draft.workId);
  const [commercialContext, setCommercialContext] = useState<any>(null);
  const commercial = !!draft.commercial;
  useEffect(() => {
    if (!commercial || prefix === "comparison") return;
    let active = true;
    void commercialRequest("/commercial-context")
      .then((v) => {
        if (active) setCommercialContext(v);
      })
      .catch(() => {
        if (active) setCommercialContext(null);
      });
    return () => {
      active = false;
    };
  }, [commercial, draft.workId, draft.revision, user?.uid]);
  const [catalog, setCatalog] = useState<SagaCatalog | null>(null);
  const [catalogError, setCatalogError] = useState("");
  async function reloadCatalog() {
    setCatalogError("");
    try {
      const token = await user?.getIdToken();
      const r = await fetch("/api/integrations/saga/catalog", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token || ""}` },
      });
      const data = await r.json();
      if (
        !r.ok ||
        !Array.isArray(data.products) ||
        !Array.isArray(data.warehouses)
      )
        throw new Error(data.error || "Catalog SAGA indisponibil.");
      setCatalog(data);
    } catch (e) {
      setCatalogError((e as Error).message);
    }
  }
  useEffect(() => {
    if (!readOnly) void reloadCatalog();
  }, [user?.uid, draft.workId, readOnly]);
  return (
    <fieldset disabled={readOnly} className="space-y-4">
      <legend className="mb-2 font-semibold">Beneficiar fiscal</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {Object.entries(fieldNames).map(([key, label]) => (
          <label key={key} className="space-y-1 text-sm">
            <span>
              {label}
              {key === "name" && !draft.beneficiary.name.trim()
                ? " · lipsește"
                : ""}
            </span>
            <Input
              aria-label={`${prefix === "comparison" ? "Versiune salvată: " : ""}${label}`}
              value={draft.beneficiary[key as keyof typeof fieldNames]}
              maxLength={1000}
              onChange={(e) =>
                onChange({
                  beneficiary: { ...draft.beneficiary, [key]: e.target.value },
                })
              }
            />
          </label>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {(
          [
            ["country", "Țara beneficiarului"],
            ["county", "Județ beneficiar (cod, ex. IF)"],
            ["city", "Localitate beneficiar"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="text-sm">
            {label}
            <Input
              aria-label={`${prefix}: ${label}`}
              value={draft.beneficiary[key] || ""}
              maxLength={key === "country" ? 2 : 100}
              onChange={(e) =>
                onChange({
                  beneficiary: {
                    ...draft.beneficiary,
                    [key]:
                      key === "country" || key === "county"
                        ? e.target.value.toUpperCase()
                        : e.target.value,
                  },
                })
              }
            />
          </label>
        ))}
      </div>
      {(!draft.beneficiary.cui.trim() || !draft.beneficiary.address.trim()) && (
        <p className="text-sm text-amber-800">
          Date fiscale incomplete. Ciorna poate fi salvată pentru completare
          ulterioară.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span>Data documentului{!draft.date ? " · lipsește" : ""}</span>
          <Input
            aria-label={`${prefix}: Data documentului`}
            type="date"
            value={draft.date}
            onChange={(e) =>
              onChange({
                date: e.target.value,
                ...(draft.commercial?.dueMode === "auto"
                  ? {
                      dueDate: dueFromTerm(
                        e.target.value,
                        draft.commercial.termDays,
                      ),
                    }
                  : {}),
              })
            }
          />
        </label>
        <label className="space-y-1 text-sm">
          <span>{commercial ? "Scadență" : "Scadență (opțional)"}</span>
          <Input
            aria-label={`${prefix}: Scadență`}
            type="date"
            value={draft.dueDate}
            onChange={(e) =>
              onChange({
                dueDate: e.target.value,
                ...(draft.commercial
                  ? { commercial: { ...draft.commercial, dueMode: "manual" } }
                  : {}),
              })
            }
          />
        </label>
      </div>
      {draft.commercial && (
        <div className="space-y-2 text-sm">
          <p>
            Scadență{" "}
            {draft.commercial.dueMode === "auto" ? "automată" : "manuală"} ·{" "}
            {draft.commercial.termDays === null
              ? "termen necunoscut; completează manual"
              : `${draft.commercial.termDays} zile confirmate`}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              onChange({
                commercial: { ...draft.commercial!, dueMode: "auto" },
                dueDate: dueFromTerm(draft.date, draft.commercial!.termDays),
              })
            }
          >
            Revino la scadență automată
          </Button>
          <p>
            Cod client SAGA:{" "}
            {commercialContext?.entry?.code || "asociere lipsă"} · Agent
            emitent:{" "}
            {commercialContext?.agent
              ? `${commercialContext.agent.code} — ${commercialContext.agent.name}`
              : "neconfirmat"}
          </p>
          <label className="block">
            Informații suplimentare factură
            <textarea
              aria-label="Informații suplimentare factură"
              className="block w-full rounded border p-2"
              value={draft.extraInfo || ""}
              maxLength={2000}
              onChange={(e) => onChange({ extraInfo: e.target.value })}
            />
          </label>
        </div>
      )}
      <div className="flex items-center justify-between">
        <h4 className="font-semibold">Produse și servicii</h4>
        <span className="text-xs text-slate-500">RON · prețuri fără TVA</span>
      </div>
      {prefix !== "comparison" && (
        <div className="space-y-2">
          {catalogError && (
            <p role="alert" className="text-sm text-amber-800">
              {catalogError} Ciorna rămâne disponibilă.
            </p>
          )}
          {!readOnly && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void reloadCatalog()}
            >
              Actualizează asocierile SAGA
            </Button>
          )}
        </div>
      )}
      {!draft.lines.length && (
        <p className="rounded-md border border-dashed p-3 text-sm text-slate-500">
          Nu există produse precompletate. Adaugă pozițiile necesare.
        </p>
      )}
      {draft.lines.map((line, index) => (
        <div key={line.id} className="rounded-md border p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-slate-500">Poziția {index + 1}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`${prefix}: Șterge poziția ${index + 1}`}
              onClick={() =>
                onChange({ lines: draft.lines.filter((l) => l.id !== line.id) })
              }
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          {commercial && (
            <InvoiceCommercialSelector
              line={line}
              index={index}
              readOnly={readOnly}
              onChange={(updated) =>
                onChange({
                  lines: draft.lines.map((l) =>
                    l.id === line.id ? updated : l,
                  ),
                })
              }
            />
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
            <label className="col-span-2 space-y-1 text-sm sm:col-span-3">
              <span>Denumire{!line.name.trim() ? " · lipsește" : ""}</span>
              <Input
                aria-label={`${prefix}: Denumire ${index + 1}`}
                value={line.name}
                maxLength={1000}
                onChange={(e) =>
                  onChange({
                    lines: draft.lines.map((l) =>
                      l.id === line.id ? { ...l, name: e.target.value } : l,
                    ),
                  })
                }
              />
            </label>
            {(
              [
                ["um", "UM"],
                ["quantity", "Cantitate"],
                ["price", "Preț unitar"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="space-y-1 text-sm">
                <span>
                  {label}
                  {line[key] === "" ? " · lipsește" : ""}
                </span>
                <Input
                  aria-label={`${prefix}: ${label} ${index + 1}`}
                  inputMode={key === "um" ? "text" : "decimal"}
                  readOnly={commercial && key !== "quantity"}
                  value={line[key]}
                  maxLength={key === "um" ? 40 : 20}
                  onChange={(e) =>
                    onChange({
                      lines: draft.lines.map((l) =>
                        l.id === line.id ? { ...l, [key]: e.target.value } : l,
                      ),
                    })
                  }
                />
              </label>
            ))}
          </div>
          {commercial && (
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-sm">
                TVA linie (%)
                <Input
                  aria-label={`TVA linie ${index + 1}`}
                  readOnly
                  value={line.vatPercent || ""}
                />
              </label>
              <label className="text-sm">
                Informații suplimentare linie
                <textarea
                  aria-label={`Informații suplimentare linie ${index + 1}`}
                  className="w-full rounded border p-2"
                  value={line.extraInfo || ""}
                  maxLength={2000}
                  onChange={(e) =>
                    onChange({
                      lines: draft.lines.map((l) =>
                        l.id === line.id
                          ? { ...l, extraInfo: e.target.value }
                          : l,
                      ),
                    })
                  }
                />
              </label>
            </div>
          )}
          <InvoiceSagaFields
            commercial={commercial}
            key={`${line.id}:${stockKey(line.saga)}:${catalog?.products.map((p) => `${p.id}:${p.revision}`).join(",") || ""}:${catalog?.warehouses.map((w) => `${w.id}:${w.revision}`).join(",") || ""}`}
            line={line}
            lines={draft.lines}
            catalog={catalog}
            workId={draft.workId}
            readOnly={readOnly}
            index={index}
            onChange={(saga) =>
              onChange({
                lines: draft.lines.map((l) =>
                  l.id === line.id
                    ? {
                        ...l,
                        saga,
                        ...(commercial && !saga
                          ? {
                              commercial: undefined,
                              price: "",
                              um: "",
                              vatPercent: "",
                            }
                          : {}),
                      }
                    : l,
                ),
              })
            }
          />
        </div>
      ))}
      {prefix === "invoice" && (
        <InvoiceSagaArticle
          draft={draft}
          readOnly={readOnly}
          onBusy={onBusy}
          onAdd={(line) => {
            onChange({ lines: [...draft.lines, line] });
            void reloadCatalog();
          }}
        />
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={readOnly || draft.lines.length >= 100}
        onClick={() =>
          onChange({
            lines: [
              ...draft.lines,
              {
                id: crypto.randomUUID(),
                name: "",
                um: "",
                quantity: "",
                price: "",
              },
            ],
          })
        }
      >
        <Plus className="mr-2 h-4 w-4" />
        Adaugă poziție
      </Button>
      <div className="grid grid-cols-2 gap-3">
        {!commercial && (
          <label className="space-y-1 text-sm">
            <span>TVA (%)</span>
            <Input
              aria-label={`${prefix}: TVA (%)`}
              inputMode="decimal"
              value={draft.vatPercent}
              onChange={(e) => onChange({ vatPercent: e.target.value })}
            />
          </label>
        )}
        <label className="space-y-1 text-sm">
          <span>Reducere (%)</span>
          <Input
            aria-label={`${prefix}: Reducere (%)`}
            inputMode="decimal"
            readOnly={commercial && commercialContext?.canAdmin !== true}
            value={draft.discountPercent}
            onChange={(e) => onChange({ discountPercent: e.target.value })}
          />
        </label>
      </div>
      {commercial && (
        <div className="text-sm">
          {commercialContext?.canAdmin === true && onApproveDiscount && (
            <label>
              <input
                type="checkbox"
                checked={approveDiscount}
                onChange={(e) => onApproveDiscount(e.target.checked)}
              />{" "}
              Aprob explicit discountul la salvare
            </label>
          )}
          {Number(draft.discountPercent) > 0 &&
            draft.commercial?.discountApproval?.percent !==
              draft.discountPercent && (
              <p>
                Discountul nenul necesită aprobarea adminului înainte de
                pregătirea XML.
              </p>
            )}
        </div>
      )}
    </fieldset>
  );
}
