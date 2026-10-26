/** Private backups only. Never a command, signature, or canonical work document. */
export const TICKET_DRAFT_SCHEMA = 1 as const;
export const OFFLINE_ACCESS_MS = 24 * 60 * 60 * 1000;
export const TICKET_CACHE_LIMIT = 250 * 1024 * 1024;
export const DRAFT_LOCAL_LIMIT = 500 * 1024 * 1024;
export type TicketDraftKind = "intervention" | "revision" | "installation";
export type DraftPhoto = {
  id: string;
  path: string;
  name: string;
  contentType: string;
  size: number;
};
export type TicketDraft = {
  schemaVersion: 1;
  ownerUid: string;
  draftId: string;
  key: string;
  workId: string;
  targetId: string;
  kind: TicketDraftKind;
  baseVersion: string | null;
  sheetRevision: number | null;
  localRevision: number;
  saveId: string;
  deviceId: string;
  expectedHead: string | null;
  content: Record<string, any>;
  photos: DraftPhoto[];
};
export type SavedTicketDraft = TicketDraft & {
  accepted: boolean;
  savedAt: number;
};
export type OfflineTicketGrant = {
  sessionId: string;
  confirmedAt: number;
  expiresAt: number;
};
export const draftFields = {
  intervention: [
    "constatareLaLocatie",
    "descriereInterventie",
    "statusEchipament",
    "cauzaPrincipalaDefectId",
    "tehnicianGarantieDecizie",
    "tehnicianGarantieNuIntraMotiv",
    "necesitaOferta",
    "comentariiOferta",
    "notaInternaTehnician",
    "products",
    "numeBeneficiar",
    "manualEmails",
    "useManualRecipients",
    "imaginiDefecte",
  ],
  revision: ["sections", "finalObservations", "photos"],
  installation: [
    "finding",
    "operations",
    "installationStatus",
    "blockReason",
    "internalNote",
    "beneficiaryName",
  ],
} as const;
const text = (v: unknown, limit = 12000) => {
  if (typeof v !== "string" || v.length > limit)
    throw new Error("Câmp de ciornă invalid.");
  return v;
};
/** Rebuild nested objects as well: a spread of the original form could retain signatures. */
export function ticketDraftContent(
  kind: TicketDraftKind,
  input: Record<string, any>,
) {
  const out: Record<string, any> = {};
  for (const key of draftFields[kind]) {
    const v = input[key];
    if (v === undefined) continue;
    if (["necesitaOferta", "useManualRecipients"].includes(key)) {
      if (typeof v !== "boolean") throw new Error("Câmp de ciornă invalid.");
      out[key] = v;
    } else if (key === "sections") {
      if (!Array.isArray(v) || v.length > 100)
        throw new Error("Checklist prea mare.");
      out[key] = v.map((s) => {
        if (!Array.isArray(s.items) || s.items.length > 200)
          throw new Error("Checklist invalid.");
        return {
          id: text(s.id, 160),
          title: text(s.title || "", 1000),
          showTitle: s.showTitle !== false,
          items: s.items.map((i: any) => ({
            id: text(i.id, 160),
            label: text(i.label, 1000),
            ...(i.state ? { state: text(i.state, 40) } : {}),
            obs: text(i.obs || ""),
          })),
        };
      });
    } else if (key === "products") {
      if (!Array.isArray(v) || v.length > 100)
        throw new Error("Lista de produse este prea mare.");
      out[key] = v.map((p) =>
        Object.fromEntries(
          Object.entries(p).filter(
            ([k, val]) =>
              [
                "id",
                "name",
                "nume",
                "denumire",
                "description",
                "descriere",
                "quantity",
                "cantitate",
                "unit",
                "unitate",
                "um",
                "price",
                "pret",
                "unitPrice",
                "total",
                "productId",
                "type",
                "tip",
                "code",
                "cod",
                "currency",
                "moneda",
                "vat",
                "tva",
                "discount",
              ].includes(k) &&
              ((typeof val === "string" && val.length <= 12000) ||
                (typeof val === "number" && Number.isFinite(val)) ||
                typeof val === "boolean"),
          ),
        ),
      );
    } else if (key === "photos" || key === "imaginiDefecte") {
      if (!Array.isArray(v) || v.length > 4)
        throw new Error("Maximum 4 fotografii.");
      out[key] = v.map((p) =>
        Object.fromEntries(
          ["id", "path", "name", "fileName", "contentType", "url"]
            .filter((k) => typeof p[k] === "string")
            .map((k) => [k, text(p[k], 2000)]),
        ),
      );
    } else out[key] = text(v);
  }
  if (JSON.stringify(out).length > 180000)
    throw new Error("Ciorna este prea mare.");
  return out;
}
export function draftIdentity(
  key: string,
): {
  draftId: string;
  workId: string;
  targetId: string;
  kind: TicketDraftKind;
} | null {
  const m = /^([\w-]{1,160})(?::(revision|sheet):([\w-]{1,160}))?$/.exec(key);
  if (!m) return null;
  return {
    draftId: key.replace(/:/g, "~"),
    workId: m[1],
    targetId: m[3] || "",
    kind:
      m[2] === "sheet"
        ? "installation"
        : m[2] === "revision"
          ? "revision"
          : "intervention",
  };
}
export function offlineTicketAccess(
  grant: OfflineTicketGrant | null,
  now: number,
) {
  return (
    !!grant &&
    now >= grant.confirmedAt &&
    now < grant.expiresAt &&
    grant.expiresAt - grant.confirmedAt <= OFFLINE_ACCESS_MS
  );
}
export function privatePhotoPath(uid: string, draftId: string, id: string) {
  return `mobile-drafts/${uid}/${draftId}/${id}`;
}
