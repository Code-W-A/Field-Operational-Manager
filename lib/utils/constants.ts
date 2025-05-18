/**
 * Constante pentru statusurile lucrărilor
 */
export const WORK_STATUS = {
  LISTED: "Listată",
  ASSIGNED: "Atribuită",
  IN_PROGRESS: "În lucru",
  WAITING: "În așteptare",
  COMPLETED: "Finalizat",
}

/**
 * Array cu toate statusurile lucrărilor pentru dropdown-uri
 */
export const WORK_STATUS_OPTIONS = [
  WORK_STATUS.LISTED,
  WORK_STATUS.ASSIGNED,
  WORK_STATUS.IN_PROGRESS,
  WORK_STATUS.WAITING,
  WORK_STATUS.COMPLETED,
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

/**
 * Constante pentru tipurile de lucrări
 */
export const WORK_TYPE = {
  PAID: "Contra cost",
  WARRANTY: "În garanție",
  PREPARATION: "Pregătire instalare",
  INSTALLATION: "Instalare",
  CONTRACT: "Intervenție în contract",
}

/**
 * Array cu toate tipurile de lucrări pentru dropdown-uri
 */
export const WORK_TYPE_OPTIONS = [
  WORK_TYPE.PAID,
  WORK_TYPE.WARRANTY,
  WORK_TYPE.PREPARATION,
  WORK_TYPE.INSTALLATION,
  WORK_TYPE.CONTRACT,
]

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

  switch (lucrare.statusLucrare.toLowerCase()) {
    case WORK_STATUS.LISTED.toLowerCase():
      return "bg-gray-50"
    case WORK_STATUS.ASSIGNED.toLowerCase():
      return "bg-yellow-50"
    case WORK_STATUS.IN_PROGRESS.toLowerCase():
      return "bg-blue-50"
    case WORK_STATUS.WAITING.toLowerCase():
      return "bg-orange-50"
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

/**
 * Funcție pentru a obține clasa CSS pentru tipul lucrării
 * @param tip Tipul lucrării
 * @returns Clasa CSS corespunzătoare
 */
export function getWorkTypeClass(tip: string): string {
  switch (tip.toLowerCase()) {
    case WORK_TYPE.PAID.toLowerCase():
      return "bg-red-50 text-red-700 border-red-200"
    case WORK_TYPE.WARRANTY.toLowerCase():
      return "bg-yellow-50 text-yellow-700 border-yellow-200"
    case WORK_TYPE.PREPARATION.toLowerCase():
      return "bg-blue-50 text-blue-700 border-blue-200"
    case WORK_TYPE.INSTALLATION.toLowerCase():
      return "bg-green-50 text-green-700 border-green-200"
    case WORK_TYPE.CONTRACT.toLowerCase():
      return "bg-purple-50 text-purple-700 border-purple-200"
    default:
      return "bg-gray-50 text-gray-700 border-gray-200"
  }
}
