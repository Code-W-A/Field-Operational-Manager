/** Additive, online-only API contract. Does not enter the offline command queue. */
export type RemoteSignatureTarget = {
  workId: string;
  kind: "report" | "sheet" | "completion";
  sheetId?: string;
};
export type RemoteSignatureStatus =
  | "invited"
  | "awaiting_confirmation"
  | "signed"
  | "cancelled"
  | "invalidated"
  | "expired";
export type RemoteSignatureDelivery = {
  status: "pending" | "sending" | "sent" | "simulated" | "unknown";
  error?: string;
};
export type RemoteSignatureSummary = {
  id: string;
  target: RemoteSignatureTarget;
  status: RemoteSignatureStatus;
  expiresAt: number;
  documentHash: string;
  signedAt: string | null;
  email?: string;
  url?: string;
  delivery: Partial<
    Record<"invite" | "confirm" | "final", RemoteSignatureDelivery>
  >;
};
export type RemoteSignatureCreate = RemoteSignatureTarget & {
  action: "create";
  requestId: string;
  email: string;
  technicianSignature: string;
  expectedVersion?: string | number;
  observations?: string;
};

// Persist an epoch when signed content changes. Editing and then restoring old
// text must not resurrect a previously issued signing link.
const CONTENT_KEYS = new Set([
  "client",
  "clientId",
  "locationId",
  "locatie",
  "clientInfo",
  "persoanaContact",
  "telefon",
  "tipLucrare",
  "defectReclamat",
  "echipament",
  "echipamentCod",
  "echipamentId",
  "equipmentIds",
  "constatareLaLocatie",
  "descriereInterventie",
  "statusEchipament",
  "cauzaPrincipalaDefectId",
  "cauzaPrincipalaDefect",
  "products",
  "imaginiDefecte",
  "timpSosire",
  "timpPlecare",
  "dataSosire",
  "oraSosire",
  "dataPlecare",
  "oraPlecare",
  "durataInterventie",
  "nrLucrare",
  "numarRaport",
  "revisionEquipmentTimes",
  "dataInterventie",
  "tehnicieni",
  "technicianIds",
  "statusLucrare",
  "anulat",
  "archivedAt",
  "finding",
  "operations",
  "installationStatus",
  "blockReason",
  "photos",
  "sections",
  "finalObservations",
  "timeIntervals",
]);
function stable(value: any): string {
  if (value?.toDate) return JSON.stringify(value.toDate().toISOString());
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .filter((k) => value[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stable(value[k])}`)
      .join(",")}}`;
  return JSON.stringify(value ?? null);
}
export function remoteSignatureContentChanged(
  before: Record<string, any>,
  patch: Record<string, any>,
) {
  return Object.entries(patch).some(([key, value]) => {
    const parts = key.split(".");
    if (!CONTENT_KEYS.has(parts[0])) return false;
    const old = parts.reduce<any>((v, key) => v?.[key], before);
    return stable(old) !== stable(value);
  });
}
