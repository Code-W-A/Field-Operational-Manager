import { formatBucharestDateTime, REPORT_TIMEZONE } from "@/lib/reports/date-range"
import type {
  AuditChange,
  AuditChangeKind,
  AuditEvent,
  AuditValueItem,
  AuditValuePresentation,
} from "@/lib/reports/types"

const SENSITIVE_FIELD = /password|passphrase|token|secret|credential|kioskpin|pin$|signature|semnatura|image|imagine|photo|fotograf|base64|privatekey|mailpassword|filecontent|filedata|attachmentdata/i
const BINARY_VALUE = /^(?:data:[^;]+;base64,|[A-Za-z0-9+/]{500,}={0,2}$)/i

export interface AuditPresentationContext {
  ticketLabel?: string
  revisionEquipmentName?: string
  equipmentLabels?: Record<string, string>
}

const FIELD_LABELS: Record<string, string> = {
  status: "Status",
  statusLucrare: "Status tichet",
  statusFacturare: "Status facturare",
  dataEmiterii: "Data emiterii",
  dataInterventie: "Data intervenției",
  raportGenerat: "Raport generat",
  numarRaport: "Număr raport",
  nrLucrare: "Număr tichet",
  client: "Client",
  clientId: "Client",
  locationId: "Locație",
  locationName: "Locație",
  locatie: "Locație",
  tipLucrare: "Tip tichet",
  tehnicieni: "Tehnicieni alocați",
  descriere: "Descriere",
  descriereInterventie: "Descrierea intervenției",
  constatareLaLocatie: "Constatare la locație",
  defectReclamat: "Defect reclamat",
  cauzaPrincipalaDefect: "Cauza principală",
  echipament: "Echipament",
  echipamentCod: "Cod echipament",
  echipamentModel: "Model echipament",
  equipmentIds: "Echipamente selectate",
  revisionEquipmentTimes: "Timpii reviziei pe echipamente",
  revision: "Progresul reviziei",
  equipmentStatus: "Starea reviziei pe echipamente",
  checklistVersionId: "Fișă de verificare utilizată",
  sections: "Puncte de verificare",
  finalObservations: "Observații finale",
  overallState: "Starea generală a echipamentului",
  qrVerified: "Cod QR verificat",
  qrVerifiedAt: "Data verificării codului QR",
  completedAt: "Data finalizării",
  completedBy: "Finalizat de",
  startIso: "Începutul reviziei",
  endIso: "Finalul reviziei",
  durationMinutes: "Durată",
  durationText: "Durată",
  equipmentVerified: "Echipament verificat",
  persoanaContact: "Persoană de contact",
  persoaneContact: "Persoane de contact",
  persoanaContactEmail: "Email persoană de contact",
  telefon: "Telefon",
  contract: "Contract",
  contractNumber: "Număr contract",
  contractType: "Tip contract",
  preluatDispecer: "Preluat de dispecer",
  preluatDe: "Dispecer",
  statusEchipament: "Status echipament",
  necesitaOferta: "Necesită ofertă",
  products: "Produse ofertă",
  offerTotal: "Total ofertă",
  offerAdjustmentPercent: "Ajustare ofertă",
  devizProducts: "Produse deviz",
  devizTotal: "Total deviz",
  devizVAT: "TVA deviz",
  devizAdjustmentPercent: "Ajustare deviz",
  timpSosire: "Ora sosirii",
  dataSosire: "Data sosirii",
  oraSosire: "Ora sosirii",
  timpPlecare: "Ora plecării",
  dataPlecare: "Data plecării",
  oraPlecare: "Ora plecării",
  durataInterventie: "Durata intervenției",
  numeTehnician: "Nume tehnician",
  numeBeneficiar: "Nume beneficiar",
  raportSnapshot: "Datele raportului",
  displayName: "Nume utilizator",
  email: "Adresă de email",
  role: "Rol",
  name: "Nume",
  nume: "Nume",
  title: "Titlu",
  subject: "Subiect",
  priority: "Prioritate",
  assignedTo: "Responsabil",
  dueDate: "Termen limită",
  startAt: "Data începerii",
  endAt: "Data încheierii",
  createdBy: "Creat de",
  updatedBy: "Actualizat de",
  modifiedBy: "Modificat de",
  oldValue: "Valoare anterioară",
  newValue: "Valoare nouă",
}

const ENTITY_ARTICLES: Record<string, string> = {
  tichet: "tichetul",
  client: "clientul",
  contract: "contractul",
  utilizator: "utilizatorul",
  pontaj: "pontajul",
  salariat: "salariatul",
  "cerere hr": "cererea HR",
  "pontaj lunar": "pontajul lunar",
  setare: "setarea",
  "setare predefinită": "setarea predefinită",
  email: "emailul",
  "oportunitate crm": "oportunitatea CRM",
  "sarcină crm": "sarcina CRM",
  "ofertă crm": "oferta CRM",
  raport: "raportul",
  document: "documentul",
  sesiune: "sesiunea",
}

const MODULE_LABELS: Record<string, string> = {
  lucrari: "Tichete",
  tichete: "Tichete",
  clienti: "Clienți",
  contracts: "Contracte",
  contracte: "Contracte",
  users: "Utilizatori",
  utilizatori: "Utilizatori",
  settings: "Setări",
  setari: "Setări",
  facturare: "Facturare",
  autentificare: "Autentificare",
  crm: "CRM",
}

function capitalize(value: string) {
  return value ? `${value.charAt(0).toLocaleUpperCase("ro-RO")}${value.slice(1)}` : value
}

function splitTechnicalName(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/([a-zăâîșț0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
}

export function isSensitiveAuditField(field: string) {
  return SENSITIVE_FIELD.test(field)
}

export function humanizeAuditField(field: string, suppliedLabel?: string) {
  const technical = String(field || "").trim()
  if (FIELD_LABELS[technical]) return FIELD_LABELS[technical]
  const supplied = String(suppliedLabel || "").trim()
  if (supplied && supplied !== technical && !/[_]|[a-z][A-Z]/.test(supplied)) return capitalize(supplied)
  return capitalize(splitTechnicalName(technical || supplied || "Câmp"))
}

function sanitizeStructuredValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === "string") {
    if (BINARY_VALUE.test(value.trim())) return "[conținut eliminat]"
    return value.length > 4_000 ? `${value.slice(0, 4_000)}…` : value
  }
  if (typeof value === "number" || typeof value === "boolean") return value
  if (depth >= 5) return "[date complexe]"
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => sanitizeStructuredValue(item, depth + 1))
  if (typeof value === "object") {
    const result: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 50)) {
      if (!isSensitiveAuditField(key)) result[key] = sanitizeStructuredValue(item, depth + 1)
    }
    return result
  }
  return String(value)
}

function parseStoredValue(value: string | undefined): unknown {
  if (value === undefined || value === "—" || value.trim() === "") return undefined
  const trimmed = value.trim()
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      return sanitizeStructuredValue(JSON.parse(trimmed))
    } catch {
      return sanitizeStructuredValue(value)
    }
  }
  if (trimmed === "true") return true
  if (trimmed === "false") return false
  return sanitizeStructuredValue(value)
}

export function sanitizeAuditRawValue(value: string | undefined) {
  if (value === undefined) return undefined
  const parsed = parseStoredValue(value)
  if (parsed === undefined) return undefined
  if (typeof parsed === "string") return parsed
  try {
    return JSON.stringify(parsed)
  } catch {
    return String(parsed)
  }
}

function formatDateValue(value: string) {
  const trimmed = value.trim()
  const isoDate = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
  const likelyDateTime = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(trimmed)
  if (!isoDate && !likelyDateTime) return null
  const date = new Date(isoDate ? `${trimmed}T12:00:00.000Z` : trimmed)
  if (Number.isNaN(date.getTime())) return null
  if (isoDate) {
    return new Intl.DateTimeFormat("ro-RO", {
      timeZone: "UTC",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date)
  }
  return formatBucharestDateTime(date)
}

function booleanText(field: string, value: boolean) {
  if (field === "raportGenerat") return value ? "Generat" : "Negenerat"
  if (field === "preluatDispecer") return value ? "Preluat" : "Nepreluat"
  if (field === "necesitaOferta") return value ? "Necesită ofertă" : "Nu necesită ofertă"
  if (field === "equipmentVerified") return value ? "Verificat" : "Neverificat"
  if (field === "qrVerified") return value ? "Verificat" : "Neverificat"
  return value ? "Da" : "Nu"
}

function primitiveText(value: unknown, field: string): string {
  if (value === undefined || value === null || value === "") return "Necompletat"
  if (typeof value === "boolean") return booleanText(field, value)
  if (typeof value === "number") return new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 2 }).format(value)
  const stringValue = String(value)
  if (field === "overallState" || field.endsWith(".state")) return revisionChecklistStateLabel(stringValue)
  return formatDateValue(stringValue) || stringValue
}

function objectItemLabel(value: Record<string, unknown>, index: number) {
  const candidate = value.name || value.nume || value.denumire || value.title || value.description || value.descriere || value.code || value.cod
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : `Element ${index + 1}`
}

function structuredItems(value: unknown, field: string): AuditValueItem[] {
  if (Array.isArray(value)) {
    if (value.every((item) => item === null || ["string", "number", "boolean"].includes(typeof item))) return []
    return value.slice(0, 20).map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return { label: `Element ${index + 1}`, value: primitiveText(item, field) }
      }
      const record = item as Record<string, unknown>
      const details = Object.entries(record)
        .filter(([key]) => !isSensitiveAuditField(key))
        .slice(0, 8)
        .map(([key, child]) => `${humanizeAuditField(key)}: ${Array.isArray(child) || (child && typeof child === "object") ? valueSummary(child, key) : primitiveText(child, key)}`)
        .join(" · ")
      return { label: objectItemLabel(record, index), value: details || "Fără detalii" }
    })
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !isSensitiveAuditField(key))
      .slice(0, 30)
      .map(([key, child]) => ({
        label: humanizeAuditField(key),
        value: Array.isArray(child) || (child && typeof child === "object") ? valueSummary(child, key) : primitiveText(child, key),
      }))
  }
  return []
}

function valueSummary(value: unknown, field: string): string {
  if (Array.isArray(value)) {
    if (!value.length) return "Niciun element"
    if (value.every((item) => item === null || ["string", "number", "boolean"].includes(typeof item))) {
      return value.map((item) => primitiveText(item, field)).join(", ")
    }
    const nouns = field === "products" || field === "devizProducts"
      ? ["produs", "produse"]
      : field === "equipmentIds"
        ? ["echipament", "echipamente"]
        : ["element", "elemente"]
    return `${value.length} ${value.length === 1 ? nouns[0] : nouns[1]}`
  }
  if (value && typeof value === "object") {
    const count = Object.keys(value as Record<string, unknown>).filter((key) => !isSensitiveAuditField(key)).length
    return count ? `${count} detalii` : "Fără detalii"
  }
  return primitiveText(value, field)
}

function replaceEquipmentIdentifiers(value: unknown, context?: AuditPresentationContext) {
  if (!Array.isArray(value) || !context?.equipmentLabels) return value
  return value.map((item) => {
    const key = String(item ?? "")
    return context.equipmentLabels?.[key] || item
  })
}

export function formatAuditValue(value: string | undefined, field: string, context?: AuditPresentationContext): AuditValuePresentation {
  const stored = parseStoredValue(value)
  const parsed = field === "equipmentIds" ? replaceEquipmentIdentifiers(stored, context) : stored
  return {
    text: valueSummary(parsed, field),
    empty: parsed === undefined || parsed === null || parsed === "",
    items: structuredItems(parsed, field),
  }
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}
}

function equipmentLabel(id: string, index: number, context?: AuditPresentationContext) {
  const resolved = String(context?.equipmentLabels?.[id] || "").trim()
  if (resolved && resolved !== id) return resolved
  if (id && id.length <= 18 && !/^[a-f0-9-]{16,}$/i.test(id)) return id
  return `Echipamentul ${index + 1}`
}

function durationLabel(value: Record<string, any>) {
  const explicit = String(value.durationText || "").trim()
  if (explicit) return explicit
  const minutes = Number(value.durationMinutes)
  if (!Number.isFinite(minutes)) return "Necompletată"
  const hours = Math.floor(minutes / 60)
  const rest = Math.max(0, Math.round(minutes % 60))
  if (!hours) return `${rest} min`
  return rest ? `${hours} h ${rest} min` : `${hours} h`
}

function revisionTimeValue(value: Record<string, any> | undefined): AuditValuePresentation {
  if (!value || !Object.keys(value).length) return { text: "Revizia nu era înregistrată", empty: true, items: [] }
  const start = value.startIso ? formatDateValue(String(value.startIso)) || String(value.startIso) : null
  const end = value.endIso ? formatDateValue(String(value.endIso)) || String(value.endIso) : null
  const items: AuditValueItem[] = []
  if (start) items.push({ label: "Începută la", value: start })
  if (end) items.push({ label: "Finalizată la", value: end })
  if (value.durationText || value.durationMinutes !== undefined) items.push({ label: "Durată", value: durationLabel(value) })
  return {
    text: end ? "Revizie finalizată" : start ? "Revizie în desfășurare" : "Timpi necompletați",
    empty: false,
    items,
  }
}

function revisionTimeText(params: {
  before?: Record<string, any>
  after?: Record<string, any>
  equipment: string
}) {
  const before = params.before || {}
  const after = params.after || {}
  const started = !before.startIso && Boolean(after.startIso)
  const finished = !before.endIso && Boolean(after.endIso)
  const removed = Boolean(Object.keys(before).length) && !Object.keys(after).length
  if (finished) {
    return {
      eventTitle: `A finalizat revizia pentru ${params.equipment}`,
      summary: `Revizia a fost finalizată. Durata înregistrată este ${durationLabel(after)}.`,
    }
  }
  if (started) {
    const at = formatDateValue(String(after.startIso)) || String(after.startIso)
    return {
      eventTitle: `A început revizia pentru ${params.equipment}`,
      summary: `Revizia a fost începută la ${at}.`,
    }
  }
  if (removed) {
    return {
      eventTitle: `A eliminat timpii reviziei pentru ${params.equipment}`,
      summary: "Înregistrarea timpului de revizie a fost eliminată.",
    }
  }
  return {
    eventTitle: `A actualizat timpul reviziei pentru ${params.equipment}`,
    summary: "Ora sau durata reviziei a fost corectată.",
  }
}

function presentRevisionEquipmentTimes(change: AuditChange, context?: AuditPresentationContext): AuditChange[] | null {
  const before = asRecord(parseStoredValue(change.before))
  const after = asRecord(parseStoredValue(change.after))
  if (!Object.keys(before).length && !Object.keys(after).length) return null
  const equipmentIds = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
  const changedIds = equipmentIds.filter((id) => JSON.stringify(before[id]) !== JSON.stringify(after[id]))
  if (!changedIds.length) return []

  return changedIds.map((id) => {
    const index = equipmentIds.indexOf(id)
    const name = equipmentLabel(id, index, context)
    const beforeTime = Object.keys(asRecord(before[id])).length ? asRecord(before[id]) : undefined
    const afterTime = Object.keys(asRecord(after[id])).length ? asRecord(after[id]) : undefined
    const wording = revisionTimeText({ before: beforeTime, after: afterTime, equipment: name })
    const synthetic: AuditChange = {
      field: `revisionEquipmentTimes.${id}`,
      label: `Revizie – ${name}`,
      before: beforeTime ? JSON.stringify(beforeTime) : undefined,
      after: afterTime ? JSON.stringify(afterTime) : undefined,
    }
    return {
      ...synthetic,
      presentation: {
        label: synthetic.label,
        kind: changeKind(synthetic),
        summary: wording.summary,
        eventTitle: wording.eventTitle,
        before: revisionTimeValue(beforeTime),
        after: revisionTimeValue(afterTime),
      },
    }
  })
}

function revisionStatusLabel(value: unknown) {
  const status = String(value || "").toLocaleLowerCase("ro-RO")
  if (status === "pending") return "În așteptare"
  if (status === "in_progress") return "Revizie în lucru"
  if (status === "done") return "Revizie finalizată"
  return value ? capitalize(splitTechnicalName(String(value))) : "Necompletat"
}

function presentRevisionStatuses(change: AuditChange, context?: AuditPresentationContext): AuditChange[] | null {
  const beforeRoot = asRecord(parseStoredValue(change.before))
  const afterRoot = asRecord(parseStoredValue(change.after))
  const before = asRecord(beforeRoot.equipmentStatus)
  const after = asRecord(afterRoot.equipmentStatus)
  if (!Object.keys(before).length && !Object.keys(after).length) return null
  const equipmentIds = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
  const changedIds = equipmentIds.filter((id) => before[id] !== after[id])
  if (!changedIds.length) return null

  return changedIds.map((id) => {
    const name = equipmentLabel(id, equipmentIds.indexOf(id), context)
    const beforeLabel = revisionStatusLabel(before[id])
    const afterLabel = revisionStatusLabel(after[id])
    const eventTitle = after[id] === "done"
      ? `A finalizat revizia pentru ${name}`
      : after[id] === "in_progress"
        ? `A început revizia pentru ${name}`
        : `A actualizat starea reviziei pentru ${name}`
    return {
      field: `revision.equipmentStatus.${id}`,
      label: `Starea reviziei – ${name}`,
      before: before[id] === undefined ? undefined : String(before[id]),
      after: after[id] === undefined ? undefined : String(after[id]),
      presentation: {
        label: `Starea reviziei – ${name}`,
        kind: before[id] === undefined ? "added" : after[id] === undefined ? "removed" : "changed",
        summary: `Starea reviziei a trecut de la „${beforeLabel}” la „${afterLabel}”.`,
        eventTitle,
        before: { text: beforeLabel, empty: before[id] === undefined, items: [] },
        after: { text: afterLabel, empty: after[id] === undefined, items: [] },
      },
    }
  })
}

function revisionChecklistStateLabel(value: unknown) {
  const state = String(value || "").toLocaleLowerCase("ro-RO")
  if (state === "functional") return "Funcțional"
  if (state === "nefunctional") return "Nefuncțional"
  if (state === "na" || state === "n/a") return "Nu se aplică"
  return value ? capitalize(splitTechnicalName(String(value))) : "Necompletat"
}

interface RevisionChecklistAuditItem {
  id: string
  label: string
  section: string
  state?: string
  obs?: string
}

function revisionChecklistItems(value: unknown) {
  const result = new Map<string, RevisionChecklistAuditItem>()
  if (!Array.isArray(value)) return result
  for (const [sectionIndex, sectionValue] of value.entries()) {
    const section = asRecord(sectionValue)
    const sectionName = String(section.title || section.name || `Secțiunea ${sectionIndex + 1}`).trim()
    const items = Array.isArray(section.items) ? section.items : []
    for (const [itemIndex, itemValue] of items.entries()) {
      const item = asRecord(itemValue)
      const id = String(item.id || `${section.id || sectionIndex}:${itemIndex}`)
      result.set(id, {
        id,
        label: String(item.label || item.name || `Punctul ${itemIndex + 1}`).trim(),
        section: sectionName,
        state: item.state == null ? undefined : String(item.state),
        obs: item.obs == null ? undefined : String(item.obs),
      })
    }
  }
  return result
}

function checklistEventTitle(context?: AuditPresentationContext) {
  return `A actualizat fișa de revizie${context?.revisionEquipmentName ? ` pentru ${context.revisionEquipmentName}` : ""}`
}

function presentRevisionSections(change: AuditChange, context?: AuditPresentationContext): AuditChange[] | null {
  const beforeItems = revisionChecklistItems(parseStoredValue(change.before))
  const afterItems = revisionChecklistItems(parseStoredValue(change.after))
  if (!beforeItems.size && !afterItems.size) return null
  const ids = Array.from(new Set([...beforeItems.keys(), ...afterItems.keys()]))
  const result: AuditChange[] = []

  for (const id of ids) {
    const before = beforeItems.get(id)
    const after = afterItems.get(id)
    const label = after?.label || before?.label || "Punct de verificare"
    const section = after?.section || before?.section
    if (before?.state !== after?.state) {
      const beforeState = revisionChecklistStateLabel(before?.state)
      const afterState = revisionChecklistStateLabel(after?.state)
      result.push({
        field: `sections.${id}.state`,
        label: label,
        before: before?.state,
        after: after?.state,
        presentation: {
          label: label,
          kind: before?.state === undefined ? "added" : after?.state === undefined ? "removed" : "changed",
          summary: `${section ? `${section}: ` : ""}starea punctului „${label}” a trecut de la „${beforeState}” la „${afterState}”.`,
          eventTitle: checklistEventTitle(context),
          before: { text: beforeState, empty: before?.state === undefined, items: [] },
          after: { text: afterState, empty: after?.state === undefined, items: [] },
        },
      })
    }
    if ((before?.obs || "") !== (after?.obs || "")) {
      const beforeObservation = String(before?.obs || "").trim()
      const afterObservation = String(after?.obs || "").trim()
      result.push({
        field: `sections.${id}.obs`,
        label: `Observație – ${label}`,
        before: beforeObservation || undefined,
        after: afterObservation || undefined,
        presentation: {
          label: `Observație – ${label}`,
          kind: !beforeObservation ? "added" : !afterObservation ? "removed" : "changed",
          summary: `${section ? `${section}: ` : ""}observația pentru „${label}” a fost actualizată.`,
          eventTitle: checklistEventTitle(context),
          before: { text: beforeObservation || "Fără observație", empty: !beforeObservation, items: [] },
          after: { text: afterObservation || "Fără observație", empty: !afterObservation, items: [] },
        },
      })
    }
  }
  return result.length ? result : null
}

function changeKind(change: AuditChange): AuditChangeKind {
  const beforeEmpty = change.before === undefined || change.before === "—" || change.before === ""
  const afterEmpty = change.after === undefined || change.after === "—" || change.after === ""
  if (beforeEmpty && !afterEmpty) return "added"
  if (!beforeEmpty && afterEmpty) return "removed"
  return "changed"
}

export function presentAuditChange(change: AuditChange, context?: AuditPresentationContext): AuditChange | null {
  if (isSensitiveAuditField(change.field)) return null
  const before = sanitizeAuditRawValue(change.before)
  const after = sanitizeAuditRawValue(change.after)
  const sanitized = { ...change, before, after }
  return {
    ...sanitized,
    label: humanizeAuditField(change.field, change.label),
    presentation: {
      label: humanizeAuditField(change.field, change.label),
      kind: changeKind(sanitized),
      before: formatAuditValue(before, change.field, context),
      after: formatAuditValue(after, change.field, context),
    },
  }
}

function humanizeModule(module: string) {
  const normalized = splitTechnicalName(module).toLocaleLowerCase("ro-RO")
  return MODULE_LABELS[normalized] || capitalize(splitTechnicalName(module || "Sistem"))
}

function humanizeEntity(entityType: string) {
  if (/tichet\s*\/\s*revisions?/i.test(entityType)) return "Fișă de revizie"
  return capitalize(splitTechnicalName(entityType || "Entitate"))
}

function actionVerb(action: string) {
  const normalized = action.toLocaleLowerCase("ro-RO")
  if (/deconect|logout/.test(normalized)) return "S-a deconectat din aplicație"
  if (/autentific|login/.test(normalized)) return "S-a autentificat în aplicație"
  if (/^(schedule|programare)$/.test(normalized)) return "A reprogramat"
  if (/^(completion|finalizare)$/.test(normalized)) return "A finalizat"
  if (/^(status|details|detalii)$/.test(normalized)) return "A actualizat"
  if (/^(assignment|atribuire)$/.test(normalized)) return "A atribuit"
  if (/șterg|sterg|delete|removed/.test(normalized)) return "A șters"
  if (/creare|creat|create|adăug|adaug/.test(normalized)) return "A creat"
  if (/actualiz|modific|update|edit/.test(normalized)) return "A actualizat"
  if (/export/.test(normalized)) return "A exportat"
  if (/descărc|descarc|download/.test(normalized)) return "A descărcat"
  if (/trimis|trimit|send/.test(normalized)) return "A trimis"
  if (/atribui|assign/.test(normalized)) return "A atribuit"
  return null
}

function friendlyActionLabel(action: string) {
  const verb = actionVerb(action)
  if (!verb) return capitalize(splitTechnicalName(action || "Acțiune"))
  if (verb.startsWith("S-a ")) return verb
  return capitalize(verb.replace(/^A /, ""))
}

function entityArticle(entityType: string) {
  const key = splitTechnicalName(entityType).toLocaleLowerCase("ro-RO")
  return ENTITY_ARTICLES[key] || key || "entitatea"
}

function eventTitle(event: AuditEvent, entityDisplay: string) {
  const verb = actionVerb(event.action)
  if (verb?.startsWith("S-a ")) return verb
  if (verb) return `${verb} ${entityArticle(event.entityType)}${entityDisplay ? ` ${entityDisplay}` : ""}`
  const action = capitalize(splitTechnicalName(event.action || "Acțiune"))
  return entityDisplay ? `${action}: ${entityDisplay}` : action
}

export function ticketIdFromAuditEvent(event: Pick<AuditEvent, "entityId" | "entityType">) {
  if (!event.entityId || !event.entityType.toLocaleLowerCase("ro-RO").includes("tichet")) return undefined
  const segments = event.entityId.split("/")
  return segments[0] === "lucrari" && segments[1] ? segments[1] : event.entityId
}

function entityHref(event: AuditEvent) {
  const entity = event.entityType.toLocaleLowerCase("ro-RO")
  if (entity.includes("tichet")) {
    const ticketId = ticketIdFromAuditEvent(event)
    if (ticketId) return `/dashboard/lucrari/${encodeURIComponent(ticketId)}`
  }
  return undefined
}

function presentAuditChanges(change: AuditChange, context?: AuditPresentationContext): AuditChange[] {
  if (change.field === "revisionEquipmentTimes") {
    const revisions = presentRevisionEquipmentTimes(change, context)
    if (revisions) return revisions
  }
  if (change.field === "revision") {
    const statuses = presentRevisionStatuses(change, context)
    if (statuses) return statuses
  }
  if (change.field === "sections") {
    const checklist = presentRevisionSections(change, context)
    if (checklist) return checklist
  }
  const presented = presentAuditChange(change, context)
  return presented ? [presented] : []
}

function isRevisionEntity(event: AuditEvent) {
  return /tichet\s*\/\s*revisions?/i.test(event.entityType) || String(event.entityId || "").includes("/revisions/")
}

export function presentAuditEvent(event: AuditEvent, context?: AuditPresentationContext): AuditEvent {
  if (!context && event.presentation && event.changes.every((change) => Boolean(change.presentation))) return event
  const changes = event.changes.flatMap((change) => presentAuditChanges(change, context))
  const displayEntity = String(
    isRevisionEntity(event)
      ? context?.revisionEquipmentName || context?.ticketLabel || event.entityLabel || event.entityId || ""
      : context?.ticketLabel || event.entityLabel || event.entityId || "",
  ).trim()
  const semanticTitles = Array.from(new Set(changes.map((change) => change.presentation?.eventTitle).filter((value): value is string => Boolean(value))))
  const semanticSummaries = changes.map((change) => change.presentation?.summary).filter((value): value is string => Boolean(value))
  const title = semanticTitles.length === 1
    ? semanticTitles[0]
    : semanticTitles.length > 1
      ? `A actualizat revizia pentru ${semanticTitles.length} echipamente`
      : isRevisionEntity(event)
        ? `${actionVerb(event.action) || "A actualizat"} fișa de revizie${displayEntity ? ` pentru ${displayEntity}` : ""}`
        : eventTitle(event, displayEntity)
  const rawSummary = String(event.summary || "").trim()
  const genericSummary = rawSummary === event.action || rawSummary === `${event.action}: ${displayEntity}`
  const description = semanticSummaries.length === 1
    ? semanticSummaries[0]
    : semanticSummaries.length > 1
      ? `${semanticSummaries.length} modificări sunt explicate mai jos.`
      : changes.length
        ? `${changes.length} ${changes.length === 1 ? "informație modificată" : "informații modificate"}`
        : isRevisionEntity(event)
          ? "A salvat informațiile din fișa de verificare a echipamentului."
    : genericSummary || !rawSummary
      ? "Activitate înregistrată fără diferențe de câmp."
      : rawSummary

  return {
    ...event,
    module: humanizeModule(event.module),
    entityType: humanizeEntity(event.entityType),
    changes,
    presentation: {
      title,
      description,
      actionLabel: friendlyActionLabel(event.action),
      moduleLabel: humanizeModule(event.module),
      entityLabel: displayEntity || humanizeEntity(event.entityType),
      entityHref: entityHref(event),
      changeCount: changes.length,
    },
  }
}

export function formatActivityDay(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return "Dată necunoscută"
  return capitalize(new Intl.DateTimeFormat("ro-RO", {
    timeZone: REPORT_TIMEZONE,
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date))
}

export function activityDayKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return "unknown"
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: REPORT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

export function formatActivityTime(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat("ro-RO", {
    timeZone: REPORT_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date)
}
