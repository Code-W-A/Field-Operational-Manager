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
