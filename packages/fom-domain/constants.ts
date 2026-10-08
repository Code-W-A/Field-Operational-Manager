/**
 * Constante pentru statusurile lucrărilor
 */
export const WORK_STATUS = {
  LISTED: "Listată",
  ASSIGNED: "Atribuită",
  IN_PROGRESS: "În lucru",
  WAITING: "În așteptare",
  POSTPONED: "Amânată",
  NO_SIGNATURE: "Fără semnătură",
  COMPLETED: "Finalizat",
  ARCHIVED: "Arhivată",
  CANCELED: "Anulat",
};

/**
 * Array cu toate statusurile lucrărilor pentru dropdown-uri
 */
export const WORK_STATUS_OPTIONS = [
  WORK_STATUS.LISTED,
  WORK_STATUS.ASSIGNED,
  WORK_STATUS.IN_PROGRESS,
  WORK_STATUS.WAITING,
  WORK_STATUS.POSTPONED,
  WORK_STATUS.NO_SIGNATURE,
  WORK_STATUS.COMPLETED,
  WORK_STATUS.ARCHIVED,
  WORK_STATUS.CANCELED,
];

/**
 * Constante pentru statusurile de facturare
 */
export const INVOICE_STATUS = {
  INVOICED: "Facturat",
  NOT_INVOICED: "Nefacturat",
  NO_INVOICE: "Nu se facturează",
};

/**
 * Array cu toate statusurile de facturare pentru dropdown-uri
 */
export const INVOICE_STATUS_OPTIONS = [
  INVOICE_STATUS.INVOICED,
  INVOICE_STATUS.NOT_INVOICED,
  INVOICE_STATUS.NO_INVOICE,
];

// Înlocuiesc definiția WORK_TYPE cu WORK_TYPES pentru a păstra consistența cu numele anterior
// și adaug toate tipurile de lucrări din imagine

/**
 * Constante pentru tipurile de lucrări
 */
export const WORK_TYPES = {
  OFFER: "Ofertare",
  CONTRACTING: "Contractare",
  WORKSHOP_PREPARATION: "Pregătire în atelier",
  INSTALLATION: "Instalare",
  DELIVERY: "Predare",
  WARRANTY_INTERVENTION: "Intervenție în garanție",
  PAID_INTERVENTION: "Intervenție contra cost",
  CONTRACT_INTERVENTION: "Intervenție în contract",
  RE_INTERVENTION: "Re-Intervenție",
  REVISION: "Revizie",
};

/**
 * Array cu toate tipurile de lucrări pentru dropdown-uri
 */
export const WORK_TYPE_OPTIONS = Object.values(WORK_TYPES).filter(
  (type) => type !== WORK_TYPES.OFFER && type !== WORK_TYPES.CONTRACTING,
);
