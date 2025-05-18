/**
 * Constante pentru statusurile lucrărilor
 */
export const WORK_STATUS = {
  LISTED: "Listată",
  ASSIGNED: "Atribuită",
  IN_PROGRESS: "În lucru",
  WAITING: "În așteptare",
  COMPLETED: "Finalizat",
} as const

// Tip pentru statusurile lucrărilor
export type WorkStatus = (typeof WORK_STATUS)[keyof typeof WORK_STATUS]

// Array cu toate statusurile lucrărilor pentru dropdown-uri
export const WORK_STATUS_OPTIONS = Object.values(WORK_STATUS)

/**
 * Constante pentru statusurile de facturare
 */
export const INVOICE_STATUS = {
  NOT_INVOICED: "Nefacturat",
  INVOICED: "Facturat",
  NO_INVOICE_NEEDED: "Nu se facturează",
} as const

// Tip pentru statusurile de facturare
export type InvoiceStatus = (typeof INVOICE_STATUS)[keyof typeof INVOICE_STATUS]

// Array cu toate statusurile de facturare pentru dropdown-uri
export const INVOICE_STATUS_OPTIONS = Object.values(INVOICE_STATUS)

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
} as const

// Tip pentru tipurile de lucrări
export type WorkType = (typeof WORK_TYPES)[keyof typeof WORK_TYPES]

// Array cu toate tipurile de lucrări pentru dropdown-uri
export const WORK_TYPE_OPTIONS = Object.values(WORK_TYPES)

/**
 * Funcții helper pentru obținerea culorilor sau claselor CSS bazate pe status
 */

// Obține clasa CSS pentru badge-ul de status lucrare
export function getWorkStatusClass(status: string): string {
  const statusLower = status.toLowerCase()

  switch (statusLower) {
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

// Obține clasa CSS pentru rândul din tabel bazat pe statusul lucrării
export function getWorkStatusRowClass(status: string): string {
  const statusLower = status.toLowerCase()

  switch (statusLower) {
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

// Obține clasa CSS pentru badge-ul de status facturare
export function getInvoiceStatusClass(status: string): string {
  const statusLower = status.toLowerCase()

  switch (statusLower) {
    case INVOICE_STATUS.INVOICED.toLowerCase():
      return "bg-green-100 text-green-800 hover:bg-green-200"
    case INVOICE_STATUS.NOT_INVOICED.toLowerCase():
      return "bg-red-100 text-red-800 hover:bg-red-200"
    case INVOICE_STATUS.NO_INVOICE_NEEDED.toLowerCase():
      return "bg-orange-100 text-orange-800 hover:bg-orange-200"
    default:
      return "bg-gray-100 text-gray-800 hover:bg-gray-200"
  }
}

// Obține clasa CSS pentru badge-ul de tip lucrare
export function getWorkTypeClass(type: string): string {
  const typeLower = type.toLowerCase()

  switch (typeLower) {
    case WORK_TYPES.PAID_INTERVENTION.toLowerCase():
      return "bg-red-50 text-red-700 border-red-200"
    case WORK_TYPES.WARRANTY_INTERVENTION.toLowerCase():
      return "bg-yellow-50 text-yellow-700 border-yellow-200"
    case WORK_TYPES.WORKSHOP_PREPARATION.toLowerCase():
      return "bg-blue-50 text-blue-700 border-blue-200"
    case WORK_TYPES.INSTALLATION.toLowerCase():
      return "bg-green-50 text-green-700 border-green-200"
    default:
      return "bg-gray-50 text-gray-700 border-gray-200"
  }
}

// Obține varianta de badge pentru statusul lucrării (pentru componenta Badge din shadcn/ui)
export function getWorkStatusVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" | "success" | "warning" {
  const statusLower = status.toLowerCase()

  switch (statusLower) {
    case WORK_STATUS.WAITING.toLowerCase():
      return "warning"
    case WORK_STATUS.IN_PROGRESS.toLowerCase():
      return "default"
    case WORK_STATUS.COMPLETED.toLowerCase():
      return "success"
    default:
      return "secondary"
  }
}

// Obține varianta de badge pentru statusul facturării (pentru componenta Badge din shadcn/ui)
export function getInvoiceStatusVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" | "success" {
  const statusLower = status.toLowerCase()

  switch (statusLower) {
    case INVOICE_STATUS.NOT_INVOICED.toLowerCase():
      return "outline"
    case INVOICE_STATUS.INVOICED.toLowerCase():
      return "default"
    case INVOICE_STATUS.NO_INVOICE_NEEDED.toLowerCase():
      return "success"
    default:
      return "secondary"
  }
}
