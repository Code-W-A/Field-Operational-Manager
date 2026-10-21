import {
  getArchiveValidationDetails,
  type ArchiveRulesConfig,
} from "@/lib/utils/archive-validation";
import type { InstallationListResponse } from "@/types/installation";

export const installationArchiveSettings: Record<
  keyof ArchiveRulesConfig,
  string
> = {
  requireFinalizedStatus: "archive_require_finalized_status",
  requireDispatcherPickup: "archive_require_dispatcher_pickup",
  requireInvoiceOrNoInvoicing: "archive_require_invoice_or_no_invoicing",
  requireNoInvoicingReason: "archive_require_no_invoicing_reason",
  offerRequireOfferSentWhenNeeded:
    "archive_offer_require_offer_sent_when_needed",
  offerBlockWhenAccepted: "archive_offer_block_when_accepted",
  offerWait30DaysWhenNoResponse: "archive_offer_wait_30_days_when_no_response",
};

// Web-only extension; the shared mobile installation contract stays unchanged.
export type InstallationWorkspaceResponse = InstallationListResponse & {
  managementActions?: { archiveReasons: string[] };
};

export function installationArchiveReasons(
  work: Record<string, any>,
  state: { completionExists: boolean; openSheets: boolean; sessions: boolean },
  config?: Partial<ArchiveRulesConfig>,
) {
  if (work.anulat || work.installation?.closedReason === "cancelled")
    return ["Tichetul este anulat."];
  if (work.archivedAt || work.statusLucrare === "Arhivată")
    return ["Tichetul este deja arhivat."];
  const reasons: string[] = [];
  if (
    work.statusLucrare !== "Finalizat" ||
    work.installation?.closedReason !== "completed"
  )
    reasons.push("Finalizează instalarea și semnează PV-ul.");
  if (!work.installation?.completionDocumentId || !state.completionExists)
    reasons.push("PV-ul final semnat nu este disponibil.");
  if (
    state.openSheets ||
    Object.keys(work.installation?.activeSheetByEquipment || {}).length ||
    Object.keys(work.installation?.awaitingSheetByEquipment || {}).length
  )
    reasons.push("Închide și semnează toate fișele zilnice.");
  if (state.sessions) reasons.push("Oprește sesiunile de lucru active.");
  const messages: Record<string, string> = {
    "Lucrarea trebuie să fie în status 'Finalizat' pentru a putea fi arhivată":
      "Finalizează instalarea și semnează PV-ul.",
    "Necesită preluare de dispecer înainte de arhivare":
      "Preia tichetul înainte de arhivare.",
    "Încărcați factura sau marcați 'Nu se facturează' pentru a arhiva":
      "Adaugă factura sau alege «Nu se facturează».",
    "Completați motivul pentru 'Nu se facturează' pentru a arhiva":
      "Completează motivul nefacturării.",
    "Lucrarea necesită ofertă, dar oferta nu a fost încă transmisă":
      "Trimite oferta necesară.",
    "Oferta a fost acceptată. Se poate arhiva doar după lansarea reintervenției (crearea reintervenției în sistem)":
      "Oferta acceptată necesită lansarea reintervenției.",
    "Oferta a fost transmisă, dar nu există data de expirare (30 zile). Retrimite oferta pentru a seta perioada de așteptare.":
      "Retrimite oferta pentru a stabili termenul de răspuns.",
  };
  for (const reason of getArchiveValidationDetails(work, config)
    .blockingReasons) {
    reasons.push(
      messages[reason] ||
        reason.replace(
          "Oferta a fost transmisă fără răspuns. Se poate arhiva după expirarea perioadei de 30 de zile",
          "Așteaptă răspunsul la ofertă sau expirarea termenului",
        ),
    );
  }
  return [...new Set(reasons)];
}
