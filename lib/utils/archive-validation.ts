/**
 * Utilități pentru validarea regulilor de arhivare
 */
import { toDateSafe as parseDate } from "@/lib/utils/time-format"

export interface ArchiveValidationResult {
  canArchive: boolean
  reason?: string
}

export interface ArchiveRulesConfig {
  requireFinalizedStatus: boolean
  requireDispatcherPickup: boolean
  requireInvoiceOrNoInvoicing: boolean
  requireNoInvoicingReason: boolean
  offerRequireOfferSentWhenNeeded: boolean
  offerBlockWhenAccepted: boolean
  // Numele istoric este păstrat pentru compatibilitate cu setarea salvată.
  offerWait30DaysWhenNoResponse: boolean
}

const DEFAULT_RULES: ArchiveRulesConfig = {
  requireFinalizedStatus: true,
  requireDispatcherPickup: true,
  requireInvoiceOrNoInvoicing: true,
  requireNoInvoicingReason: true,
  offerRequireOfferSentWhenNeeded: true,
  offerBlockWhenAccepted: true,
  offerWait30DaysWhenNoResponse: true,
}

export interface ArchiveValidationDetails {
  canArchive: boolean
  blockingReasons: string[]
  ignoredRules: string[] // reguli dezactivate din Setări Sistem (informativ)
}

const DAY_MS = 24 * 60 * 60 * 1000
const OFFER_ARCHIVE_WAIT_DAYS = 30
const OFFER_TOKEN_TTL_DAYS = 30

function readDate(value: unknown): Date | null {
  const finite = (date: Date | null | undefined) =>
    date instanceof Date && Number.isFinite(date.getTime()) ? date : null
  if (typeof value === "number" && Number.isFinite(value)) return finite(new Date(value))
  if (value && typeof value === "object" && typeof (value as { _seconds?: unknown })._seconds === "number") {
    return finite(new Date((value as { _seconds: number })._seconds * 1000))
  }
  return finite(parseDate(value))
}

function earliestDate(values: unknown[]): Date | null {
  const dates = values.map(readDate).filter((date): date is Date => date instanceof Date)
  if (!dates.length) return null
  return dates.reduce((earliest, date) => (date.getTime() < earliest.getTime() ? date : earliest))
}

/** Data trimiterii, nu expirarea unui link regenerat. */
function offerSentAt(lucrare: any): Date | null {
  const recorded = readDate(lucrare?.offerArchiveSentAt)
  if (recorded) return recorded
  if (lucrare?.lastOfferEmail?.status !== "failed") {
    const emailed = readDate(lucrare?.lastOfferEmail?.sentAt)
    if (emailed) return emailed
  }

  const reissued = Boolean(lucrare?.offerActionReissuedAt || lucrare?.offerActionReissueCount)
  const legacyExpiry = readDate(lucrare?.offerActionExpiresAt)
  if (legacyExpiry && !reissued) {
    return new Date(legacyExpiry.getTime() - OFFER_TOKEN_TTL_DAYS * DAY_MS)
  }

  const versions = Array.isArray(lucrare?.offerVersions) ? lucrare.offerVersions : []
  return earliestDate([
    lucrare?.offerActionVersionSavedAt,
    lucrare?.offerPreparedAt,
    ...versions.map((version: { savedAt?: unknown }) => version?.savedAt),
  ])
}

function offerArchiveDeadline(lucrare: any): Date | null {
  const sentAt = offerSentAt(lucrare)
  return sentAt ? new Date(sentAt.getTime() + OFFER_ARCHIVE_WAIT_DAYS * DAY_MS) : null
}

function offerWaitingReason(lucrare: any): string | undefined {
  const deadline = offerArchiveDeadline(lucrare)
  if (!deadline) {
    return "Oferta a fost transmisă, dar nu există data trimiterii. Retrimite oferta pentru a seta perioada de așteptare de 30 zile."
  }
  const remaining = deadline.getTime() - Date.now()
  if (remaining > 0) {
    return `Oferta a fost transmisă fără răspuns. Se poate arhiva după expirarea perioadei de 30 zile de la trimitere (mai rămân ${Math.ceil(remaining / DAY_MS)} zile)`
  }
}

/**
 * Versiune extinsă: întoarce toate motivele care blochează arhivarea + regulile ignorate (dezactivate).
 */
export function getArchiveValidationDetails(lucrare: any, config?: Partial<ArchiveRulesConfig>): ArchiveValidationDetails {
  const rules: ArchiveRulesConfig = { ...DEFAULT_RULES, ...(config || {}) }
  const blockingReasons: string[] = []
  const ignoredRules: string[] = []

  // Regula "status finalizat" (era în UI, acum o centralizăm aici pentru configurabilitate)
  if (rules.requireFinalizedStatus) {
    if (lucrare?.statusLucrare !== "Finalizat") {
      blockingReasons.push("Lucrarea trebuie să fie în status 'Finalizat' pentru a putea fi arhivată")
    }
  } else {
    ignoredRules.push("Status 'Finalizat' obligatoriu")
  }

  // Reguli standard existente (preluare + facturare)
  const hasInvoiceDoc = Boolean(lucrare?.facturaDocument)
  const noInvoicingSelected = lucrare?.statusFacturare === "Nu se facturează"
  const hasNoInvoiceReason = Boolean(lucrare?.motivNefacturare && String(lucrare?.motivNefacturare).trim().length > 0)
  const isPickedUp = lucrare?.preluatDispecer === true

  if (rules.requireDispatcherPickup) {
    if (!isPickedUp) {
      blockingReasons.push("Necesită preluare de dispecer înainte de arhivare")
    }
  } else {
    ignoredRules.push("Preluare dispecer obligatorie")
  }

  if (rules.requireInvoiceOrNoInvoicing) {
    if (!hasInvoiceDoc && !noInvoicingSelected) {
      blockingReasons.push("Încărcați factura sau marcați 'Nu se facturează' pentru a arhiva")
    }

    if (rules.requireNoInvoicingReason) {
      if (noInvoicingSelected && !hasNoInvoiceReason) {
        blockingReasons.push("Completați motivul pentru 'Nu se facturează' pentru a arhiva")
      }
    } else {
      ignoredRules.push("Motiv obligatoriu pentru 'Nu se facturează'")
    }
  } else {
    ignoredRules.push("Factură sau 'Nu se facturează' obligatoriu")
    // Dacă nu cerem deloc factură/no-invoicing, nu mai are sens să cerem motivul.
    ignoredRules.push("Motiv obligatoriu pentru 'Nu se facturează'")
  }

  // Reguli ofertă
  const hasOfferSent =
    (lucrare?.offerSendCount && lucrare.offerSendCount > 0) ||
    (Array.isArray(lucrare?.offerVersions) && lucrare.offerVersions.length > 0)

  if (lucrare?.necesitaOferta === true) {
    if (rules.offerRequireOfferSentWhenNeeded) {
      if (!hasOfferSent) {
        blockingReasons.push("Lucrarea necesită ofertă, dar oferta nu a fost încă transmisă")
      }
    } else {
      ignoredRules.push("Necesită ofertă → ofertă trimisă obligatoriu")
    }
  }

  if (rules.offerBlockWhenAccepted) {
    if (lucrare?.offerResponse?.status === "accept") {
      // Noua regulă: acceptată => se permite arhivarea doar după ce există o reintervenție lansată (lucrare nouă creată).
      const hasReinterventionLaunched =
        lucrare?.reinterventieLansata === true ||
        Boolean(lucrare?.reinterventieLansataAt) ||
        Boolean(lucrare?.reinterventieLucrareId) ||
        // Backward compatibility: unele lucrări vechi au reintervenții create, dar nu au flag-urile backfilled.
        (Array.isArray(lucrare?.reinterventii) && lucrare.reinterventii.length > 0) ||
        (typeof lucrare?.reinterventiiCount === "number" && lucrare.reinterventiiCount > 0)

      if (!hasReinterventionLaunched) {
        blockingReasons.push("Oferta a fost acceptată. Se poate arhiva doar după lansarea reintervenției (crearea reintervenției în sistem)")
      }
    }
  } else {
    ignoredRules.push("Blocare când oferta este acceptată")
  }

  // Răspunsul accept/refuz anulează așteptarea pentru lipsa răspunsului.
  if (hasOfferSent && !lucrare?.offerResponse) {
    if (rules.offerWait30DaysWhenNoResponse) {
      const reason = offerWaitingReason(lucrare)
      if (reason) blockingReasons.push(reason)
    } else {
      ignoredRules.push("Așteptare 30 zile fără răspuns la ofertă")
    }
  }

  return {
    canArchive: blockingReasons.length === 0,
    blockingReasons,
    ignoredRules,
  }
}

/**
 * Verifică dacă o lucrare poate fi arhivată conform regulilor:
 * 
 * 1. Nu se poate arhiva dacă are bifat "Necesita oferta" și nu are o ofertă transmisă
 * 2. Nu se poate arhiva dacă are o ofertă transmisă și acceptată. 
 *    Următoarea acțiune trebuie să fie reintervenție și abia apoi se activează butonul de arhivare
 * 3. Se activează butonul de arhivare dacă refuză oferta
 * 4. Se activează butonul de arhivare la 30 zile de la transmiterea ofertei care nu are un răspuns accept/refuz
 */
export function validateArchiveRules(lucrare: any): ArchiveValidationResult {
  // Regulă 1: Nu se poate arhiva dacă necesită ofertă și nu are ofertă transmisă
  if (lucrare.necesitaOferta === true) {
    const hasOfferSent = (lucrare.offerSendCount && lucrare.offerSendCount > 0) || 
                        (lucrare.offerVersions && lucrare.offerVersions.length > 0)
    
    if (!hasOfferSent) {
      return {
        canArchive: false,
        reason: "Lucrarea necesită ofertă, dar oferta nu a fost încă transmisă"
      }
    }
  }

  // Regulă 2: Nu se poate arhiva dacă are ofertă acceptată (trebuie să existe reintervenție)
  if (lucrare.offerResponse?.status === "accept") {
    // Când oferta este acceptată, workflow-ul normal este:
    // 1. Clientul acceptă oferta
    // 2. Se creează o reintervenție (lucrare nouă cu lucrareOriginala === lucrare.id)
    // 3. După finalizarea reintervenției, lucrarea originală poate fi arhivată
    // 
    // Nota: În viitor, putem adăuga verificare automată pentru existența reintervenției,
    // dar momentan blocăm simplu arhivarea până când dispecerul/adminul decide manual
    return {
      canArchive: false,
      reason: "Oferta a fost acceptată. Următoarea acțiune trebuie să fie reintervenție înainte de arhivare"
    }
  }

  // Regulă 3: Se poate arhiva dacă oferta este refuzată
  if (lucrare.offerResponse?.status === "reject") {
    return {
      canArchive: true
    }
  }

  // Regulă 4: Se poate arhiva după 30 zile de la transmiterea ofertei fără răspuns
  const hasOfferSent = (lucrare.offerSendCount && lucrare.offerSendCount > 0) || 
                      (lucrare.offerVersions && lucrare.offerVersions.length > 0)
  
  if (hasOfferSent && !lucrare.offerResponse) {
    // EXCEPȚIE: dacă lucrarea este deja finalizată cu raport + facturare rezolvată,
    // permitem arhivarea imediat (altfel rămâne blocată în Dashboard).
    const hasInvoiceDoc = Boolean(lucrare?.facturaDocument)
    const noInvoicingSelected = lucrare?.statusFacturare === "Nu se facturează"
    const isReportDone = lucrare?.raportGenerat === true

    if (isReportDone && (hasInvoiceDoc || noInvoicingSelected)) {
      return { canArchive: true }
    }

    const reason = offerWaitingReason(lucrare)
    return reason ? { canArchive: false, reason } : { canArchive: true }

  }

  // Dacă nu intră în niciuna din regulile de ofertă, verificăm regulile standard existente
  return {
    canArchive: true
  }
}

/**
 * Verifică toate regulile de arhivare, inclusiv cele standard (factură, preluare)
 */
export function canArchiveLucrare(lucrare: any, config?: Partial<ArchiveRulesConfig>): ArchiveValidationResult {
  const details = getArchiveValidationDetails(lucrare, config)
    return {
    canArchive: details.canArchive,
    reason: details.blockingReasons[0],
  }
}

