import * as functions from "firebase-functions"
import { initializeApp } from "firebase-admin/app"
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore"
import * as tls from "node:tls"
import * as net from "node:net"

// Initialize the default Firebase app for Admin SDK
initializeApp()

const db = getFirestore()
const REGION = "europe-west1"
const TIMEZONE = "Europe/Bucharest"
const MAX_WORKS_PER_RUN = 200

// =========================
// HR Requests → Timesheets
// =========================

type HrRequestKind = "CO" | "CFP" | "CM" | "IN" | "DEL" | "CORRECT_HOURS" | "ADD_OVERTIME"
type HrRequestStatus = "pending" | "approved" | "rejected"

type HrRequest = {
  employeeId: string
  employeeName?: string
  requesterUid: string
  sectorId: string
  managerUid: string
  kind: HrRequestKind
  status: HrRequestStatus
  payload: any
  rejectionReason?: string | null
}

// =========================
// SMTP email (no deps)
// =========================

type SmtpConfig = {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  from: string
}

function getSmtpConfig(): SmtpConfig | null {
  const cfg: any = (functions as any).config?.() ?? {}
  const smtp = cfg.smtp ?? {}
  const host = process.env.SMTP_HOST ?? smtp.host
  const portRaw = process.env.SMTP_PORT ?? smtp.port ?? "465"
  const secureRaw = process.env.SMTP_SECURE ?? smtp.secure ?? "true"
  const user = process.env.SMTP_USER ?? smtp.user
  const pass = process.env.SMTP_PASS ?? smtp.pass
  const from = process.env.SMTP_FROM ?? smtp.from ?? user
  const port = Number(portRaw)
  const secure = String(secureRaw) === "true" || String(secureRaw) === "1"
  if (!host || !user || !pass || !from || !Number.isFinite(port)) return null
  return { host: String(host), port, secure, user: String(user), pass: String(pass), from: String(from) }
}

function b64(s: string) {
  return Buffer.from(String(s), "utf8").toString("base64")
}

async function smtpSendMail(params: { to: string; subject: string; text: string }) {
  const cfg = getSmtpConfig()
  if (!cfg) {
    console.warn("SMTP not configured; skipping email to", params.to)
    return
  }

  const socket: net.Socket = cfg.secure
    ? (tls.connect({ host: cfg.host, port: cfg.port, servername: cfg.host }) as any)
    : net.connect({ host: cfg.host, port: cfg.port })

  socket.setEncoding("utf8")

  let buffer = ""
  const readResponse = (): Promise<{ code: number; lines: string[] }> =>
    new Promise((resolve, reject) => {
      const onData = (chunk: string) => {
        buffer += chunk
        // SMTP responses end with \r\n; multi-line uses "xyz-" prefix.
        const parts = buffer.split("\r\n")
        if (parts.length < 2) return
        // Keep last incomplete line in buffer.
        buffer = parts.pop() ?? ""
        const lines = parts.filter(Boolean)
        if (!lines.length) return

        // Detect last response line: same code + space, not hyphen.
        const last = lines[lines.length - 1]
        const m = /^(\d{3})([ -])/.exec(last)
        if (!m) return
        const code = Number(m[1])
        const sep = m[2]
        if (sep === "-") return // still expecting more lines

        socket.off("data", onData)
        resolve({ code, lines })
      }

      const onError = (err: any) => {
        socket.off("data", onData)
        reject(err)
      }

      socket.on("data", onData)
      socket.once("error", onError)
    })

  const cmd = async (line: string, ok: number | number[]) => {
    socket.write(line + "\r\n")
    const res = await readResponse()
    const oks = Array.isArray(ok) ? ok : [ok]
    if (!oks.includes(res.code)) {
      throw new Error(`SMTP command failed (${line}) -> ${res.code} ${res.lines.join(" | ")}`)
    }
    return res
  }

  try {
    // Greeting
    const greet = await readResponse()
    if (greet.code !== 220) throw new Error(`SMTP greeting failed: ${greet.code}`)

    await cmd(`EHLO ${cfg.host}`, [250])
    await cmd("AUTH LOGIN", [334])
    await cmd(b64(cfg.user), [334])
    await cmd(b64(cfg.pass), [235])
    await cmd(`MAIL FROM:<${cfg.from}>`, [250])
    await cmd(`RCPT TO:<${params.to}>`, [250, 251])
    await cmd("DATA", [354])

    const headers = [
      `From: ${cfg.from}`,
      `To: ${params.to}`,
      `Subject: ${params.subject}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: 8bit",
    ].join("\r\n")
    const body = params.text.replace(/\r?\n/g, "\r\n")
    socket.write(headers + "\r\n\r\n" + body + "\r\n.\r\n")

    const dataRes = await readResponse()
    if (dataRes.code !== 250) throw new Error(`SMTP DATA failed: ${dataRes.code}`)
    await cmd("QUIT", [221])
  } finally {
    try {
      socket.end()
      socket.destroy()
    } catch {}
  }
}

async function getUserEmail(uid: string): Promise<{ email: string | null; displayName: string | null }> {
  try {
    const snap = await db.collection("users").doc(uid).get()
    const data = snap.data() as any
    const email = typeof data?.email === "string" ? data.email : null
    const displayName = typeof data?.displayName === "string" ? data.displayName : null
    return { email, displayName }
  } catch (e) {
    console.error("getUserEmail failed", uid, e)
    return { email: null, displayName: null }
  }
}

function kindLabel(kind: HrRequestKind) {
  switch (kind) {
    case "CO":
      return "Concediu de odihnă"
    case "CFP":
      return "Concediu fără plată"
    case "CM":
      return "Concediu medical"
    case "IN":
      return "Învoire"
    case "DEL":
      return "Delegație"
    case "CORRECT_HOURS":
      return "Corectare ore"
    case "ADD_OVERTIME":
      return "Ore suplimentare"
    default:
      return String(kind)
  }
}

function statusLabel(status: HrRequestStatus) {
  if (status === "approved") return "Aprobat"
  if (status === "rejected") return "Respins"
  return "Pending"
}

function requestDateLabel(req: HrRequest) {
  const p: any = req.payload ?? {}
  if (p?.startDate && p?.endDate) return `${p.startDate} → ${p.endDate}`
  if (p?.date && p?.startTime && p?.endTime) return `${p.date} • ${p.startTime}–${p.endTime}`
  if (p?.date) return String(p.date)
  return "—"
}

type TimesheetCell = {
  code: string
  hours?: number
  entries?: Array<{
    start: string
    end: string
    project?: string
    methodStart?: string
    methodEnd?: string
    sourceRequestId?: string
    sourceRequestKind?: HrRequestKind
  }>
  breaks?: Array<{
    start: string
    end: string
    sourceRequestId?: string
    sourceRequestKind?: HrRequestKind
  }>
}

function parseDateParts(yyyyMmDd: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(yyyyMmDd).trim())
  if (!m) return null
  const y = Number(m[1])
  const mm = Number(m[2])
  const d = Number(m[3])
  if (!Number.isFinite(y) || !Number.isFinite(mm) || !Number.isFinite(d)) return null
  if (mm < 1 || mm > 12 || d < 1 || d > 31) return null
  return { y, m: mm, d }
}

function monthKeyFromDate(yyyyMmDd: string): string | null {
  const p = parseDateParts(yyyyMmDd)
  if (!p) return null
  return `${p.y}-${String(p.m).padStart(2, "0")}`
}

function timesheetDocId(employeeId: string, monthKey: string) {
  return `${employeeId}_${monthKey}`
}

function enumerateDatesInclusive(start: string, end: string): string[] {
  const ps = parseDateParts(start)
  const pe = parseDateParts(end)
  if (!ps || !pe) return []
  const startUtc = Date.UTC(ps.y, ps.m - 1, ps.d)
  const endUtc = Date.UTC(pe.y, pe.m - 1, pe.d)
  if (!Number.isFinite(startUtc) || !Number.isFinite(endUtc)) return []
  const out: string[] = []
  for (let t = startUtc; t <= endUtc; t += 24 * 60 * 60 * 1000) {
    const d = new Date(t)
    const y = d.getUTCFullYear()
    const m = String(d.getUTCMonth() + 1).padStart(2, "0")
    const day = String(d.getUTCDate()).padStart(2, "0")
    out.push(`${y}-${m}-${day}`)
  }
  return out
}

function parseHM(v: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v).trim())
  if (!m) return null
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null
  return hh * 60 + mm
}

function minutesToHM(total: number) {
  const hh = Math.floor(total / 60)
  const mm = total % 60
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`
}

function calcMinutes(cell: TimesheetCell): number {
  const entries = cell.entries ?? []
  const breaks = cell.breaks ?? []
  let work = 0
  for (const e of entries) {
    const s = parseHM(e.start)
    const en = parseHM(e.end)
    if (s == null || en == null) continue
    work += Math.max(0, en - s)
  }
  let br = 0
  for (const b of breaks) {
    const s = parseHM(b.start)
    const en = parseHM(b.end)
    if (s == null || en == null) continue
    br += Math.max(0, en - s)
  }
  return Math.max(0, work - br)
}

async function getEmployeeProgramEnd(employeeId: string): Promise<string> {
  try {
    const snap = await db.collection("hrEmployees").doc(employeeId).get()
    const end = (snap.data() as any)?.programLucruEnd
    if (typeof end === "string" && end.trim()) return end.trim()
  } catch (e) {
    console.error("getEmployeeProgramEnd failed", employeeId, e)
  }
  return "16:30"
}

function buildTimesheetCellForRequest(params: {
  requestId: string
  req: HrRequest
  date: string // yyyy-mm-dd
  existing?: TimesheetCell | null
  programEnd?: string
}): TimesheetCell | null {
  const kind = params.req.kind
  const p = params.req.payload ?? {}
  const requestId = params.requestId

  if (kind === "CO" || kind === "CFP" || kind === "CM" || kind === "DEL") {
    return { code: kind }
  }

  if (kind === "IN") {
    const startTime = String(p.startTime || "08:00")
    const endTime = String(p.endTime || "16:00")
    const entry = {
      start: startTime,
      end: endTime,
      project: "Învoire",
      methodStart: "Aprobat cerere",
      methodEnd: "Aprobat cerere",
      sourceRequestId: requestId,
      sourceRequestKind: kind,
    }
    const next: TimesheetCell = { code: "IN", entries: [entry], breaks: [] }
    next.hours = Math.round((calcMinutes(next) / 60) * 100) / 100
    return next
  }

  if (kind === "CORRECT_HOURS") {
    const entries = Array.isArray(p.entries) ? p.entries : []
    const breaks = Array.isArray(p.breaks) ? p.breaks : []
    const nextEntries = entries
      .filter((e: any) => e?.start && e?.end)
      .map((e: any) => ({
        start: String(e.start),
        end: String(e.end),
        project: e.project ? String(e.project) : undefined,
        methodStart: "Corectat (cerere aprobată)",
        methodEnd: "Corectat (cerere aprobată)",
        sourceRequestId: requestId,
        sourceRequestKind: kind,
      }))
    const nextBreaks = breaks
      .filter((b: any) => b?.start && b?.end)
      .map((b: any) => ({
        start: String(b.start),
        end: String(b.end),
        sourceRequestId: requestId,
        sourceRequestKind: kind,
      }))
    const next: TimesheetCell = { code: "WORK", entries: nextEntries, breaks: nextBreaks }
    next.hours = Math.round((calcMinutes(next) / 60) * 100) / 100
    return next
  }

  if (kind === "ADD_OVERTIME") {
    const overtimeHours = Number(p.overtimeHours ?? 0)
    if (!Number.isFinite(overtimeHours) || overtimeHours <= 0) return null
    const programEnd = params.programEnd ?? "16:30"
    const startM = parseHM(programEnd) ?? 16 * 60 + 30
    const endM = Math.min(23 * 60 + 59, startM + Math.round(overtimeHours * 60))
    const entry = {
      start: minutesToHM(startM),
      end: minutesToHM(endM),
      project: "Ore suplimentare",
      methodStart: "Aprobat cerere",
      methodEnd: "Aprobat cerere",
      sourceRequestId: requestId,
      sourceRequestKind: kind,
    }
    const existing = params.existing ?? null
    const baseEntries = Array.isArray(existing?.entries) ? existing!.entries! : []
    const baseBreaks = Array.isArray(existing?.breaks) ? existing!.breaks! : []
    // idempotency: if we already have an entry from this request, don't add again
    const already = baseEntries.some((e: any) => e?.sourceRequestId === requestId)
    const nextEntries = already ? baseEntries : [...baseEntries, entry]
    const next: TimesheetCell = { code: "WORK", entries: nextEntries, breaks: baseBreaks }
    next.hours = Math.round((calcMinutes(next) / 60) * 100) / 100
    return next
  }

  return null
}

async function applyApprovedHrRequest(params: { requestId: string; req: HrRequest }) {
  const req = params.req
  const requestId = params.requestId
  const kind = req.kind
  const payload = req.payload ?? {}

  if (kind === "CO" || kind === "CFP" || kind === "CM" || kind === "DEL") {
    const startDate = String(payload.startDate || "")
    const endDate = String(payload.endDate || "")
    const dates = enumerateDatesInclusive(startDate, endDate)
    if (!dates.length) return

    // Group by month to minimize writes
    const byMonth = new Map<string, string[]>()
    for (const d of dates) {
      const mk = monthKeyFromDate(d)
      if (!mk) continue
      const arr = byMonth.get(mk) ?? []
      arr.push(d)
      byMonth.set(mk, arr)
    }

    const batch = db.batch()
    for (const [monthKey, ds] of byMonth) {
      const ref = db.collection("hrTimesheets").doc(timesheetDocId(req.employeeId, monthKey))
      const updates: Record<string, any> = {
        employeeId: req.employeeId,
        monthKey,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      }
      for (const dateStr of ds) {
        const parts = parseDateParts(dateStr)
        if (!parts) continue
        updates[`days.${String(parts.d)}`] = { code: kind }
      }
      batch.set(ref, updates, { merge: true })
    }
    await batch.commit()
    return
  }

  // Single-day requests
  const dayDate = String(payload.date || "")
  const mk = monthKeyFromDate(dayDate)
  const parts = parseDateParts(dayDate)
  if (!mk || !parts) return
  const day = parts.d

  const ref = db.collection("hrTimesheets").doc(timesheetDocId(req.employeeId, mk))
  const existingSnap = await ref.get()
  const existingCell = ((existingSnap.data() as any)?.days?.[String(day)] ?? null) as TimesheetCell | null
  const programEnd = kind === "ADD_OVERTIME" ? await getEmployeeProgramEnd(req.employeeId) : undefined
  const nextCell = buildTimesheetCellForRequest({ requestId, req, date: dayDate, existing: existingCell, programEnd })
  if (!nextCell) return

  await ref.set(
    {
      employeeId: req.employeeId,
      monthKey: mk,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      days: { [String(day)]: nextCell },
    },
    { merge: true }
  )
}

type Contract = {
  id: string
  name: string
  number?: string
  type?: string
  clientId?: string
  locationId?: string
  locationName?: string
  locationIds?: string[]
  locationNames?: string[]
  equipmentIds?: string[]
  startDate?: string
  recurrenceInterval?: number
  recurrenceUnit?: "zile" | "luni"
  daysBeforeWork?: number
  lastAutoWorkGenerated?: string
  revisionSchedulePreview?: RevisionPreview[]
}

type Client = {
  id: string
  nume?: string
}

type RevisionPreview = {
  scheduledIso?: string
  scheduledAt?: any
  generateIso?: string
  generateAt?: any
  locationId?: string
  locationName?: string
}

function toIsoDate(date: Date): string {
  return date.toISOString()
}

async function fetchClient(clientId?: string): Promise<{ name?: string; data?: Client }> {
  if (!clientId) return {}
  try {
    const snap = await db.collection("clienti").doc(clientId).get()
    if (snap.exists) {
      const data = snap.data() as Client
      return { name: data?.nume, data }
    }
  } catch (e) {
    console.error("fetchClient error", clientId, e)
  }
  return {}
}

async function workExists(contractId: string, locationId: string | undefined, scheduledIso: string) {
  // Avem date istorice cu câmpuri diferite (ex: `contract` = număr contract, sau `contractId` separat).
  // Pentru a evita duplicate, verificăm întâi pe `contractId`, apoi fallback pe `contract` (id-ul contractului).
  const probes: Array<"contractId" | "contract"> = ["contractId", "contract"]

  for (const field of probes) {
  let q = db.collection("lucrari")
      .where(field, "==", contractId)
    .where("dataInterventie", "==", scheduledIso)

  if (locationId) {
    q = q.where("locationId", "==", locationId)
  }

  const snap = await q.limit(1).get()
    if (!snap.empty) return true
  }

  return false
}

async function getNextReportNumberAdmin(): Promise<string> {
  const ref = db.collection("numarRaport").doc("document-numar-raport")
  try {
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      if (!snap.exists) {
        tx.set(ref, { numarRaport: 2 })
        return 1
      }
      const current = (snap.data() as any)?.numarRaport || 1
      const next = current + 1
      tx.update(ref, { numarRaport: next })
      return current
    })
    return `#${result.toString().padStart(6, "0")}`
  } catch (e) {
    console.error("getNextReportNumberAdmin error", e)
    return `#${Date.now().toString().slice(-6)}`
  }
}

function createWorkPayload(params: {
  contract: Contract
  clientName?: string
  clientInfo?: Client
  locationId?: string
  locationName?: string
  scheduledDate: Date
  nrLucrare: string
  equipmentIds?: string[]
}): Record<string, any> {
  const nowIso = toIsoDate(new Date())
  const scheduledIso = toIsoDate(params.scheduledDate)
  const equipmentIds =
    (Array.isArray(params.equipmentIds) ? params.equipmentIds : undefined) ??
    (Array.isArray(params.contract.equipmentIds) ? params.contract.equipmentIds : [])
  const contactName =
    (params.clientInfo as any)?.contact ||
    (params.clientInfo as any)?.persoanaContact ||
    (params.clientInfo as any)?.contactPerson ||
    (params.clientInfo as any)?.persoaneContact?.[0]?.nume ||
    ""
  const contactPhone =
    (params.clientInfo as any)?.telefon ||
    (params.clientInfo as any)?.phone ||
    (params.clientInfo as any)?.persoaneContact?.[0]?.telefon ||
    (params.clientInfo as any)?.persoaneContact?.[0]?.phone ||
    ""

  // Metadata revizie: toate echipamentele sunt setate pe "pending"
  const revision = {
    checklistVersionId: "auto", // fallback; se poate sincroniza ulterior la primul checklist
    equipmentStatus: equipmentIds.reduce<Record<string, "pending">>((acc, id) => {
      acc[id] = "pending"
      return acc
    }, {}),
    doneCount: 0,
  }

  return {
    tipLucrare: "Revizie",
    statusLucrare: "Listată",
    statusFacturare: "Nefacturat",
    client: params.clientName || params.contract.clientId || "Client",
    clientId: params.contract.clientId || null,
    clientInfo: params.clientInfo || null,
    locatie: params.locationName || "",
    locationId: params.locationId || null,
    locationName: params.locationName || null,
    contract: params.contract.id, // compatibilitate: multe ecrane folosesc acest câmp
    contractId: params.contract.id, // câmp canonical pentru dedupe/filtrare
    contractNumber: params.contract.number || "",
    contractType: params.contract.type || "",
    dataEmiterii: nowIso,
    dataInterventie: scheduledIso,
    tehnicieni: [] as string[],
    persoaneContact: [],
    persoanaContact: contactName,
    telefon: contactPhone,
    contact: contactName,
    equipmentIds,
    revision,
    echipamentId: "",
    echipamentCod: "",
    descriere: "Revizie programată automat",
    defectReclamat: "",
    necesitaOferta: false,
    statusOferta: "NU",
    nrLucrare: params.nrLucrare,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    createdBy: "system",
    createdByName: "CRON Revizie",
    notificationRead: false,
    notificationReadBy: [],
    raportGenerat: false,
    preluatDispecer: false,
    preluatDe: "",
    statusEchipament: "",
  }
}

async function generateRevisionWorks(params: { now: Date; contractId?: string }) {
  const now = params.now
  const contracts: Contract[] = []

  if (params.contractId) {
    const snap = await db.collection("contracts").doc(params.contractId).get()
    if (snap.exists) contracts.push({ id: snap.id, ...(snap.data() as any) })
  } else {
    const contractsSnap = await db.collection("contracts").get()
    contracts.push(...contractsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })))
  }

    let created = 0

    for (const contract of contracts) {
    if (created >= MAX_WORKS_PER_RUN) break
      if (!contract.revisionSchedulePreview || !Array.isArray(contract.revisionSchedulePreview)) continue

      const clientPayload = await fetchClient(contract.clientId)
      const locationEquipments = new Map<string, string[]>()
      const locs = (clientPayload.data as any)?.locatii
      if (Array.isArray(locs)) {
        for (const loc of locs) {
          const locName = loc?.nume
          if (!locName) continue
          const eqIds = Array.isArray(loc?.echipamente)
            ? loc.echipamente
                .map((eq: any) => eq?.id)
                .filter((id: any) => typeof id === "string" && id.length > 0)
            : []
          if (eqIds.length) {
            locationEquipments.set(locName, eqIds)
          }
        }
      }

      const entries: { generateAt: Date; scheduledAt: Date; locationId?: string; locationName?: string }[] = []
      for (const raw of contract.revisionSchedulePreview) {
        const genRaw = (raw as any).generateAt?.toDate?.() ?? (raw as any).generateIso ?? (raw as any).generateDate
        const schedRaw = (raw as any).scheduledAt?.toDate?.() ?? (raw as any).scheduledIso ?? (raw as any).scheduledDate
        const gen = genRaw ? new Date(genRaw) : null
        const sched = schedRaw ? new Date(schedRaw) : null
        if (!gen || Number.isNaN(gen.getTime()) || !sched || Number.isNaN(sched.getTime())) continue
        entries.push({
          generateAt: gen,
          scheduledAt: sched,
          locationId: (raw as any).locationId,
          locationName: (raw as any).locationName,
        })
      }

      entries.sort((a, b) => a.generateAt.getTime() - b.generateAt.getTime())

    const lastGeneratedRaw = contract.lastAutoWorkGenerated
    const lastGeneratedAt = lastGeneratedRaw ? new Date(lastGeneratedRaw) : null
    const lastGeneratedOk = lastGeneratedAt && !Number.isNaN(lastGeneratedAt.getTime()) ? lastGeneratedAt : null

    let createdForContract = 0

      for (const entry of entries) {
      if (created >= MAX_WORKS_PER_RUN) break

      // 1) Nu generăm înainte de generateAt (asta trebuie să corespundă UI "Următoarele date de generare")
      if (entry.generateAt > now) break
      // 2) Nu re-procesăm dacă deja am marcat că am generat până aici
      if (lastGeneratedOk && entry.generateAt <= lastGeneratedOk) continue
      // 3) Nu creăm revizii pentru date de execuție deja trecute (fără backfill implicit)
      if (entry.scheduledAt <= now) continue

        const scheduledIso = toIsoDate(entry.scheduledAt)
        const exists = await workExists(contract.id, entry.locationId, scheduledIso)
        if (exists) continue

        const nrLucrare = await getNextReportNumberAdmin()
        const payload = createWorkPayload({
          contract,
          clientName: clientPayload.name,
          clientInfo: clientPayload.data,
          locationId: entry.locationId,
          locationName: entry.locationName,
          scheduledDate: entry.scheduledAt,
          nrLucrare,
          equipmentIds: locationEquipments.get(entry.locationName || "") || undefined,
        })

      // Safety net: chiar dacă o altă bucată de cod ar crea prematur, UI va ascunde lucrarea până la generateAt.
      ;(payload as any).visibleAt = Timestamp.fromDate(entry.generateAt)
      ;(payload as any).autoGenerated = true

        await db.collection("lucrari").add(payload)
        created += 1
      createdForContract += 1
    }

    if (createdForContract > 0) {
      try {
        await db.collection("contracts").doc(contract.id).update({
          lastAutoWorkGenerated: toIsoDate(now),
        })
      } catch (e) {
        console.error("Failed to update lastAutoWorkGenerated", contract.id, e)
      }
    }
  }

  return { created }
}

// Numele acesta există deja în deploy (conform firebase debug log). Păstrăm aceeași semnătură și program.
export const generateScheduledWorks = functions
  .region(REGION)
  .pubsub.schedule("0 7,13 * * *")
  .timeZone(TIMEZONE)
  .onRun(async () => {
    const res = await generateRevisionWorks({ now: new Date() })
    console.log("generateScheduledWorks completed", res)
    return null
  })

// Callable folosit după creare/editare contract (în app/dashboard/contracte/page.tsx).
// IMPORTANT: nu creează nimic dacă nu suntem în fereastra de generare (generateAt <= now).
export const runGenerateScheduledWorks = functions
  .region(REGION)
  .https.onCall(async (data) => {
    const contractId = typeof data?.contractId === "string" && data.contractId.length > 0 ? data.contractId : undefined
    const res = await generateRevisionWorks({ now: new Date(), contractId })
    return res
  })

export const onHrRequestApproved = functions
  .region(REGION)
  .firestore.document("hrRequests/{requestId}")
  .onUpdate(async (change, context) => {
    const before = change.before.data() as any
    const after = change.after.data() as any
    const requestId = String(context.params.requestId)

    const beforeStatus = String(before?.status ?? "pending") as HrRequestStatus
    const afterStatus = String(after?.status ?? "pending") as HrRequestStatus
    if (beforeStatus === afterStatus) return null
    if (afterStatus !== "approved") return null

    const req: HrRequest = {
      employeeId: String(after.employeeId),
      employeeName: after.employeeName ? String(after.employeeName) : undefined,
      requesterUid: String(after.requesterUid),
      sectorId: String(after.sectorId),
      managerUid: String(after.managerUid),
      kind: String(after.kind) as HrRequestKind,
      status: afterStatus,
      payload: after.payload ?? {},
      rejectionReason: after.rejectionReason ?? null,
    }

    try {
      await applyApprovedHrRequest({ requestId, req })
      // best-effort marker (for debugging / future idempotency)
      await change.after.ref.set({ appliedAt: FieldValue.serverTimestamp() }, { merge: true })
    } catch (e) {
      console.error("onHrRequestApproved failed", requestId, e)
    }
    return null
  })

export const onHrRequestCreatedEmail = functions
  .region(REGION)
  .firestore.document("hrRequests/{requestId}")
  .onCreate(async (snap, context) => {
    const data = snap.data() as any
    const req: HrRequest = {
      employeeId: String(data.employeeId),
      employeeName: data.employeeName ? String(data.employeeName) : undefined,
      requesterUid: String(data.requesterUid),
      sectorId: String(data.sectorId),
      managerUid: String(data.managerUid),
      kind: String(data.kind) as HrRequestKind,
      status: String(data.status) as HrRequestStatus,
      payload: data.payload ?? {},
      rejectionReason: data.rejectionReason ?? null,
    }

    const requester = await getUserEmail(req.requesterUid)
    const manager = await getUserEmail(req.managerUid)

    const title = `${kindLabel(req.kind)} • ${requestDateLabel(req)}`
    const employeeName = req.employeeName || req.employeeId

    // Manager notification
    if (manager.email) {
      await smtpSendMail({
        to: manager.email,
        subject: `Cerere nouă de aprobat: ${title}`,
        text:
          `Ai primit o cerere nouă.\n\n` +
          `Angajat: ${employeeName}\n` +
          `Tip: ${kindLabel(req.kind)}\n` +
          `Perioadă/zi: ${requestDateLabel(req)}\n` +
          `Sector: ${req.sectorId}\n\n` +
          `Deschide aplicația: /dashboard/cereri-aprobari\n`,
      })
    }

    // Technician confirmation
    if (requester.email) {
      await smtpSendMail({
        to: requester.email,
        subject: `Cererea ta a fost înregistrată: ${title}`,
        text:
          `Cererea ta a fost înregistrată și trimisă către șeful ierarhic.\n\n` +
          `Tip: ${kindLabel(req.kind)}\n` +
          `Perioadă/zi: ${requestDateLabel(req)}\n` +
          `Status: ${statusLabel(req.status)}\n`,
      })
    }

    return null
  })

export const onHrRequestStatusChangedEmail = functions
  .region(REGION)
  .firestore.document("hrRequests/{requestId}")
  .onUpdate(async (change, context) => {
    const before = change.before.data() as any
    const after = change.after.data() as any

    const beforeStatus = String(before?.status ?? "pending") as HrRequestStatus
    const afterStatus = String(after?.status ?? "pending") as HrRequestStatus
    if (beforeStatus === afterStatus) return null

    const req: HrRequest = {
      employeeId: String(after.employeeId),
      employeeName: after.employeeName ? String(after.employeeName) : undefined,
      requesterUid: String(after.requesterUid),
      sectorId: String(after.sectorId),
      managerUid: String(after.managerUid),
      kind: String(after.kind) as HrRequestKind,
      status: afterStatus,
      payload: after.payload ?? {},
      rejectionReason: after.rejectionReason ?? null,
    }

    const requester = await getUserEmail(req.requesterUid)
    if (!requester.email) return null

    const title = `${kindLabel(req.kind)} • ${requestDateLabel(req)}`
    const rejectReason = afterStatus === "rejected" ? String(after.rejectionReason ?? "").trim() : ""

    await smtpSendMail({
      to: requester.email,
      subject: `Status cerere actualizat: ${statusLabel(afterStatus)} • ${title}`,
      text:
        `Statusul cererii tale a fost actualizat.\n\n` +
        `Tip: ${kindLabel(req.kind)}\n` +
        `Perioadă/zi: ${requestDateLabel(req)}\n` +
        `Status: ${statusLabel(afterStatus)}\n` +
        (rejectReason ? `Motiv refuz: ${rejectReason}\n` : ""),
    })

    return null
  })

