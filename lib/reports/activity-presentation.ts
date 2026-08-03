import { formatBucharestDateTime, REPORT_TIMEZONE } from "@/lib/reports/date-range"
import type {
  AuditChange,
  AuditChangeKind,
  AuditEvent,
  AuditValueItem,
  AuditValuePresentation,
} from "@/lib/reports/types"

const SENSITIVE_FIELD = /password|passphrase|token|secret|credential|kioskpin|pin$|signature|semnatura|image|imagine|base64|privatekey|mailpassword/i
const BINARY_VALUE = /^(?:data:[^;]+;base64,|[A-Za-z0-9+/]{500,}={0,2}$)/i

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
  if (depth >= 3) return "[date complexe]"
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
  return value ? "Da" : "Nu"
}

function primitiveText(value: unknown, field: string): string {
  if (value === undefined || value === null || value === "") return "Necompletat"
  if (typeof value === "boolean") return booleanText(field, value)
  if (typeof value === "number") return new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 2 }).format(value)
  const stringValue = String(value)
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

export function formatAuditValue(value: string | undefined, field: string): AuditValuePresentation {
  const parsed = parseStoredValue(value)
  return {
    text: valueSummary(parsed, field),
    empty: parsed === undefined || parsed === null || parsed === "",
    items: structuredItems(parsed, field),
  }
}

function changeKind(change: AuditChange): AuditChangeKind {
  const beforeEmpty = change.before === undefined || change.before === "—" || change.before === ""
  const afterEmpty = change.after === undefined || change.after === "—" || change.after === ""
  if (beforeEmpty && !afterEmpty) return "added"
  if (!beforeEmpty && afterEmpty) return "removed"
  return "changed"
}

export function presentAuditChange(change: AuditChange): AuditChange | null {
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
      before: formatAuditValue(before, change.field),
      after: formatAuditValue(after, change.field),
    },
  }
}

function humanizeModule(module: string) {
  const normalized = splitTechnicalName(module).toLocaleLowerCase("ro-RO")
  return MODULE_LABELS[normalized] || capitalize(splitTechnicalName(module || "Sistem"))
}

function humanizeEntity(entityType: string) {
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

function entityHref(event: AuditEvent) {
  if (!event.entityId) return undefined
  const entity = event.entityType.toLocaleLowerCase("ro-RO")
  if (entity.includes("tichet")) {
    const segments = event.entityId.split("/")
    const ticketId = segments[0] === "lucrari" && segments[1] ? segments[1] : event.entityId
    return `/dashboard/lucrari/${encodeURIComponent(ticketId)}`
  }
  return undefined
}

export function presentAuditEvent(event: AuditEvent): AuditEvent {
  const changes = event.changes.map(presentAuditChange).filter((change): change is AuditChange => Boolean(change))
  const displayEntity = String(event.entityLabel || event.entityId || "").trim()
  const title = eventTitle(event, displayEntity)
  const rawSummary = String(event.summary || "").trim()
  const genericSummary = rawSummary === event.action || rawSummary === `${event.action}: ${displayEntity}`
  const description = changes.length
    ? `${changes.length} ${changes.length === 1 ? "câmp modificat" : "câmpuri modificate"}`
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
