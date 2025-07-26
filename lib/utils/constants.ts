/**
 * Constante pentru statusurile lucrărilor
 */
export const WORK_STATUS = {
  LISTED: "Listată",
  ASSIGNED: "Atribuită",
  IN_PROGRESS: "În lucru",
  WAITING: "În așteptare",
  POSTPONED: "Amânată",
  COMPLETED: "Finalizat",
  ARCHIVED: "Arhivată",
}

/**
 * Array cu toate statusurile lucrărilor pentru dropdown-uri
 */
export const WORK_STATUS_OPTIONS = [
  WORK_STATUS.LISTED,
  WORK_STATUS.ASSIGNED,
  WORK_STATUS.IN_PROGRESS,
  WORK_STATUS.WAITING,
  WORK_STATUS.POSTPONED,
  WORK_STATUS.COMPLETED,
  WORK_STATUS.ARCHIVED,
]

/**
 * Constante pentru statusurile de facturare
 */
export const INVOICE_STATUS = {
  INVOICED: "Facturat",
  NOT_INVOICED: "Nefacturat",
  NO_INVOICE: "Nu se facturează",
}

/**
 * Array cu toate statusurile de facturare pentru dropdown-uri
 */
export const INVOICE_STATUS_OPTIONS = [INVOICE_STATUS.INVOICED, INVOICE_STATUS.NOT_INVOICED, INVOICE_STATUS.NO_INVOICE]

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
}

/**
 * Array cu toate tipurile de lucrări pentru dropdown-uri
 */
export const WORK_TYPE_OPTIONS = Object.values(WORK_TYPES)

// Actualizez și funcția getWorkTypeClass pentru a include toate tipurile noi
/**
 * Funcție pentru a obține clasa CSS pentru tipul lucrării
 * @param tip Tipul lucrării
 * @returns Clasa CSS corespunzătoare
 */
export function getWorkTypeClass(tip: string): string {
  if (!tip) return "bg-gray-50 text-gray-700 border-gray-200"

  const tipLower = tip.toLowerCase()

  switch (tipLower) {
    case WORK_TYPES.PAID_INTERVENTION.toLowerCase():
      return "bg-red-50 text-red-700 border-red-200"
    case WORK_TYPES.WARRANTY_INTERVENTION.toLowerCase():
      return "bg-yellow-50 text-yellow-700 border-yellow-200"
    case WORK_TYPES.WORKSHOP_PREPARATION.toLowerCase():
      return "bg-blue-50 text-blue-700 border-blue-200"
    case WORK_TYPES.INSTALLATION.toLowerCase():
      return "bg-green-50 text-green-700 border-green-200"
    case WORK_TYPES.CONTRACT_INTERVENTION.toLowerCase():
      return "bg-purple-50 text-purple-700 border-purple-200"
    case WORK_TYPES.OFFER.toLowerCase():
      return "bg-indigo-50 text-indigo-700 border-indigo-200"
    case WORK_TYPES.CONTRACTING.toLowerCase():
      return "bg-pink-50 text-pink-700 border-pink-200"
    case WORK_TYPES.DELIVERY.toLowerCase():
      return "bg-cyan-50 text-cyan-700 border-cyan-200"
    case WORK_TYPES.RE_INTERVENTION.toLowerCase():
      return "bg-amber-50 text-amber-700 border-amber-200"
    case WORK_TYPES.REVISION.toLowerCase():
      return "bg-emerald-50 text-emerald-700 border-emerald-200"
    default:
      return "bg-gray-50 text-gray-700 border-gray-200"
  }
}

/**
 * Funcție pentru a obține clasa CSS pentru statusul lucrării
 * @param status Statusul lucrării
 * @returns Clasa CSS corespunzătoare
 */
export function getWorkStatusClass(status: string): string {
  switch (status.toLowerCase()) {
    case WORK_STATUS.LISTED.toLowerCase():
      return "bg-gray-100 text-gray-800 hover:bg-gray-200"
    case WORK_STATUS.ASSIGNED.toLowerCase():
      return "bg-yellow-100 text-yellow-800 hover:bg-yellow-200"
    case WORK_STATUS.IN_PROGRESS.toLowerCase():
      return "bg-blue-100 text-blue-800 hover:bg-blue-200"
    case WORK_STATUS.WAITING.toLowerCase():
      return "bg-orange-100 text-orange-800 hover:bg-orange-200"
    case WORK_STATUS.POSTPONED.toLowerCase():
      return "bg-purple-100 text-purple-800 hover:bg-purple-200"
    case WORK_STATUS.COMPLETED.toLowerCase():
      return "bg-green-100 text-green-800 hover:bg-green-200"
    default:
      return "bg-gray-100 text-gray-800 hover:bg-gray-200"
  }
}

/**
 * Funcție pentru a obține clasa CSS pentru rândul tabelului în funcție de statusul lucrării
 * @param lucrare Obiectul lucrare
 * @returns Clasa CSS corespunzătoare
 */
export function getWorkStatusRowClass(lucrare: any): string {
  // Verificăm dacă lucrare există și are proprietatea statusLucrare
  if (!lucrare || !lucrare.statusLucrare) {
    return "" // Returnăm string gol pentru cazul în care lucrare sau statusLucrare nu există
  }

  // PRIORITATE MAXIMĂ: Rânduri roșii pentru condițiile critice
  // 1. Status finalizare intervenție = NEFINALIZAT (dar nu pentru lucrări cu statusLucrare = "Finalizat")
  if (lucrare.statusFinalizareInterventie === "NEFINALIZAT" && lucrare.statusLucrare !== "Finalizat") {
    return "bg-red-100 border-l-4 border-red-500"
  }

  // 2. Echipament nefuncțional
  if (lucrare.statusEchipament === "Nefuncțional") {
    return "bg-red-100 border-l-4 border-red-500"
  }

  // 3. Necesită ofertă (nou logic cu statusOferta cu fallback la necesitaOferta)
  if (lucrare.statusOferta === "DA" || (lucrare.statusOferta === undefined && lucrare.necesitaOferta === true)) {
    return "bg-red-100 border-l-4 border-red-500"
  }

  // PRIORITATE SECUNDARĂ: Colorarea normală pe baza statusului lucrării
  switch (lucrare.statusLucrare.toLowerCase()) {
    case WORK_STATUS.LISTED.toLowerCase():
      return "bg-gray-50"
    case WORK_STATUS.ASSIGNED.toLowerCase():
      return "bg-yellow-50"
    case WORK_STATUS.IN_PROGRESS.toLowerCase():
      return "bg-blue-50"
    case WORK_STATUS.WAITING.toLowerCase():
      return "bg-orange-50"
    case WORK_STATUS.POSTPONED.toLowerCase():
      return "bg-purple-50"
    case WORK_STATUS.COMPLETED.toLowerCase():
      return "bg-green-50"
    default:
      return "" // Folosim stilizarea alternativă implicită
  }
}

/**
 * Funcție pentru a obține clasa CSS pentru statusul facturării
 * @param status Statusul facturării
 * @returns Clasa CSS corespunzătoare
 */
export function getInvoiceStatusClass(status: string): string {
  switch (status.toLowerCase()) {
    case INVOICE_STATUS.INVOICED.toLowerCase():
      return "bg-green-100 text-green-800 hover:bg-green-200"
    case INVOICE_STATUS.NOT_INVOICED.toLowerCase():
      return "bg-red-100 text-red-800 hover:bg-red-200"
    case INVOICE_STATUS.NO_INVOICE.toLowerCase():
      return "bg-orange-100 text-orange-800 hover:bg-orange-200"
    default:
      return "bg-gray-100 text-gray-800 hover:bg-gray-200"
  }
}

// Adăugăm constantele pentru statusurile echipamentului după celelalte constante existente

/**
 * Constante pentru statusurile echipamentului
 */
export const EQUIPMENT_STATUS = {
  FUNCTIONAL: "Funcțional",
  PARTIALLY_FUNCTIONAL: "Parțial funcțional",
  NON_FUNCTIONAL: "Nefuncțional",
}

/**
 * Array cu toate statusurile echipamentului pentru dropdown-uri
 */
export const EQUIPMENT_STATUS_OPTIONS = [
  EQUIPMENT_STATUS.FUNCTIONAL,
  EQUIPMENT_STATUS.PARTIALLY_FUNCTIONAL,
  EQUIPMENT_STATUS.NON_FUNCTIONAL,
]

/**
 * Funcție pentru a obține clasa CSS pentru statusul echipamentului
 * @param status Statusul echipamentului
 * @returns Clasa CSS corespunzătoare
 */
export function getEquipmentStatusClass(status: string): string {
  if (!status) return "bg-gray-100 text-gray-800 hover:bg-gray-200"

  switch (status.toLowerCase()) {
    case EQUIPMENT_STATUS.FUNCTIONAL.toLowerCase():
      return "bg-green-100 text-green-800 hover:bg-green-200"
    case EQUIPMENT_STATUS.PARTIALLY_FUNCTIONAL.toLowerCase():
      return "bg-yellow-100 text-yellow-800 hover:bg-yellow-200"
    case EQUIPMENT_STATUS.NON_FUNCTIONAL.toLowerCase():
      return "bg-red-100 text-red-800 hover:bg-red-200"
    default:
      return "bg-gray-100 text-gray-800 hover:bg-gray-200"
  }
}
