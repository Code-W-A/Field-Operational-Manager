/** Shared UI/server prerequisites. The server also verifies every signed sheet. */
export function installationPickupReason(work: {
  statusLucrare: string;
  anulat?: boolean;
  archivedAt?: unknown;
  tehnicieni?: string[];
  installation?: {
    closedReason?: string;
    completionDocumentId?: string;
    startedEquipmentIds?: string[];
    activeSheetByEquipment?: Record<string, string>;
    awaitingSheetByEquipment?: Record<string, string>;
  };
}): string {
  const meta = work.installation;
  if (!meta || work.anulat || work.archivedAt || ["Arhivată", "Anulat", "Anulată"].includes(work.statusLucrare))
    return "Tichetul este arhivat sau anulat.";
  if (Object.keys(meta.activeSheetByEquipment || {}).length)
    return "Închide toate fișele active înainte de preluare.";
  if (Object.keys(meta.awaitingSheetByEquipment || {}).length)
    return "Semnează toate fișele înainte de preluare.";
  if (meta.closedReason === "completed")
    return work.statusLucrare === "Finalizat" && meta.completionDocumentId
      ? ""
      : "Procesul-verbal de terminare nu este disponibil.";
  if (meta.closedReason || work.statusLucrare === "Finalizat")
    return "Tichetul este închis pentru continuare pe alt tichet.";
  if (!work.tehnicieni?.length)
    return "Tichetul nu are tehnicieni atribuiți.";
  if (!meta.startedEquipmentIds?.length)
    return "Preluarea necesită cel puțin o fișă închisă și semnată.";
  return "";
}

type PickupSheet = {
  id: string;
  state?: string;
  signedAssignmentVersion?: number;
  signedByUid?: string;
  principalUid?: string;
  documentSnapshot?: { technicianName?: string; technicianSignature?: string; beneficiarySignature?: string };
};
type PickupAudit = { action?: string; sheetId?: string; uid?: string; at?: unknown; teamChanged?: boolean };

function millis(value: any): number {
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return typeof value === "string" ? Date.parse(value) : NaN;
}

/** Legacy signatures qualify only with an audit proving they follow the latest team boundary. */
function legacyCurrentSheet(sheet: PickupSheet, work: { tehnicieni?: string[] }, audits: PickupAudit[]) {
  if (!work.tehnicieni?.includes(sheet.documentSnapshot?.technicianName || "")) return false;
  const boundaries = audits.filter(a => a.action === "create" || a.action === "pickup" || (a.action === "edit" && a.teamChanged !== false));
  if (!boundaries.length || boundaries.some(a => !Number.isFinite(millis(a.at)))) return false;
  const boundary = Math.max(...boundaries.map(a => millis(a.at)));
  return audits.some(a => ["sign", "close"].includes(a.action || "") && a.sheetId === sheet.id
    && a.uid === (sheet.signedByUid || sheet.principalUid) && millis(a.at) > boundary);
}

export function installationPickupState(
  work: Parameters<typeof installationPickupReason>[0] & { installation?: { assignmentVersion?: number } },
  sheets: PickupSheet[],
  audits: PickupAudit[] = [],
): { eligible: boolean; reason: string } {
  let reason = installationPickupReason(work);
  const completed = work.installation?.closedReason === "completed";
  if (!reason && !completed && !sheets.length)
    reason = "Preluarea necesită cel puțin o fișă închisă și semnată.";
  if (!reason && sheets.some(s => s.state !== "closed" || !s.documentSnapshot?.technicianSignature || !s.documentSnapshot?.beneficiarySignature))
    reason = "Închide și semnează toate fișele înainte de preluare.";
  if (!reason && !completed && !sheets.some(s => s.signedAssignmentVersion === undefined
    ? legacyCurrentSheet(s, work, audits)
    : s.signedAssignmentVersion === (work.installation?.assignmentVersion || 0)))
    reason = "Preluarea necesită o fișă semnată pentru atribuirea curentă. Asocierea fișelor istorice nu este confirmată.";
  return { eligible: !reason, reason };
}
