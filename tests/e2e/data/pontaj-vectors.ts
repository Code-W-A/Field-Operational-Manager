import type { OracleRange } from "../oracles/time"

export type VectorClassification =
  | "CONFIRMATA_PRIN_COD"
  | "DEDUSA_DIN_COD"
  | "CONTRADICTORIE"
  | "NECONFIRMATA_BUSINESS"
  | "NECONFIRMATA_DEPLOYMENT"

export type PontajVector = {
  id: `V${string}`
  description: string
  classification: VectorClassification
  priority: "P0" | "P1" | "P2"
  initialData: Record<string, unknown>
  utcTime: string | null
  timezone: "Europe/Bucharest"
  schedule: { start: string; end: string; source: "employee" | "defaults" | "hard-coded" }
  breaks: OracleRange[]
  attendance: Record<string, unknown>
  initialTimesheet: Record<string, unknown> | null
  action: string
  expectedAttendance: Record<string, unknown> | null
  expectedLock: "present" | "absent" | "unchanged" | "not-applicable"
  expectedTimesheet: Record<string, unknown> | null
  expectedDashboard: Record<string, unknown> | null
  expectedCondica: Record<string, unknown> | null
  expectedProfile: Record<string, unknown> | null
  expectedReport: Record<string, unknown> | null
  blocking: boolean
  classificationReason: string
  oracle: VectorOracle
  integration: { mode: "application-helper" | "emulator-state" | "functions-trigger" | "existing-e2e" | "justified"; justification?: string }
  uiRepresentative: boolean
}

export type VectorOracle =
  | { kind: "time"; entries: OracleRange[]; breaks?: OracleRange[]; defaultBreak?: OracleRange | null; expectedMinutes: number }
  | { kind: "schedule"; employee?: Record<string, string>; defaults?: Record<string, string>; expectedMinutes: number }
  | { kind: "timezone"; startMs: number; endMs: number; expectedStart: string; expectedEnd: string; expectedMinutes: number; expectedMonthKey: string; expectedDay: string }
  | { kind: "summary"; expected: Record<string, number>; cells?: unknown[] }
  | { kind: "state"; expected: Record<string, unknown> }

type Definition = {
  id: PontajVector["id"]
  description: string
  oracle: VectorOracle
  classification?: VectorClassification
  priority?: PontajVector["priority"]
  blocking?: boolean
  ui?: boolean
  integration?: PontajVector["integration"]
  overrides?: Partial<Omit<PontajVector, "id" | "description" | "oracle">>
}

const defaultBreak: OracleRange = { start: "12:30", end: "13:00" }
const time = (entries: OracleRange[], expectedMinutes: number, breaks?: OracleRange[], fallback: OracleRange | null = defaultBreak): VectorOracle => ({
  kind: "time", entries, expectedMinutes, ...(breaks ? { breaks } : {}), defaultBreak: fallback,
})
const state = (expected: Record<string, unknown>): VectorOracle => ({ kind: "state", expected })
const summary = (expected: Record<string, number>): VectorOracle => ({ kind: "summary", expected })
const schedule = (expectedMinutes: number, employee?: Record<string, string>, defaults?: Record<string, string>): VectorOracle => ({ kind: "schedule", employee, defaults, expectedMinutes })

const definitions: Definition[] = [
  { id: "V01", description: "START 08:00, STOP 16:30", oracle: time([{ start: "08:00", end: "16:30" }], 480), ui: true, integration: { mode: "existing-e2e" } },
  { id: "V02", description: "Interval 08:00-12:00, pauza fara intersectie", oracle: time([{ start: "08:00", end: "12:00" }], 240) },
  { id: "V03", description: "Interval 13:00-16:30", oracle: time([{ start: "13:00", end: "16:30" }], 210) },
  { id: "V04", description: "Doua intervale separate", oracle: time([{ start: "08:00", end: "12:00" }, { start: "13:00", end: "16:30" }], 450) },
  { id: "V05", description: "Intervale Pontaj suprapuse", oracle: time([{ start: "08:00", end: "12:00" }, { start: "11:00", end: "16:00" }], 450), ui: true },
  { id: "V06", description: "Intervale Pontaj duplicate", oracle: time([{ start: "08:00", end: "16:00" }, { start: "08:00", end: "16:00" }], 450), ui: true },
  { id: "V07", description: "Intervale manuale suprapuse", oracle: time([{ start: "08:00", end: "12:00" }, { start: "11:00", end: "16:00" }], 450) },
  { id: "V08", description: "Pauza manuala suprima pauza implicita", oracle: time([{ start: "08:00", end: "16:30" }], 495, [{ start: "10:00", end: "10:15" }]), ui: true },
  { id: "V09", description: "Pauza partial intersectata", oracle: time([{ start: "08:00", end: "12:45" }], 270, [{ start: "12:30", end: "13:00" }]) },
  { id: "V10", description: "Pauza manuala in afara prezentei", oracle: time([{ start: "08:00", end: "12:00" }], 240, [{ start: "14:00", end: "14:30" }]) },
  { id: "V11", description: "Doua pauze manuale distincte", oracle: time([{ start: "08:00", end: "16:30" }], 465, [{ start: "10:00", end: "10:15" }, { start: "15:00", end: "15:30" }]) },
  { id: "V12", description: "Pauze manuale suprapuse", oracle: time([{ start: "08:00", end: "16:30" }], 420, [{ start: "10:00", end: "11:00" }, { start: "10:30", end: "11:30" }]) },
  { id: "V13", description: "Pauza manuala invalida revine la default", oracle: time([{ start: "08:00", end: "16:30" }], 480, [{ start: "13:00", end: "12:00" }]) },
  { id: "V14", description: "Pauza manuala valida in afara prezentei suprima default", oracle: time([{ start: "08:00", end: "16:30" }], 510, [{ start: "07:00", end: "07:15" }]) },
  { id: "V15", description: "Prezenta de 20 minute cu intersectie de pauza 10 minute", oracle: time([{ start: "12:20", end: "12:40" }], 10) },
  { id: "V16", description: "Prezenta de 30 minute cu intersectie de pauza 20 minute", oracle: time([{ start: "12:40", end: "13:10" }], 10) },
  { id: "V17", description: "Prezenta exact in pauza produce zero ore", oracle: time([{ start: "12:30", end: "13:00" }], 0), ui: true },
  { id: "V18", description: "Ora 24:00 este invalida", oracle: time([{ start: "08:00", end: "24:00" }], 0) },
  { id: "V19", description: "Interval HH:mm peste miezul noptii este invalid", oracle: time([{ start: "22:00", end: "02:00" }], 0) },
  { id: "V20", description: "Intervale adiacente", oracle: time([{ start: "08:00", end: "12:00" }, { start: "12:00", end: "16:00" }], 450) },
  { id: "V21", description: "Intarziere individuala 17 minute prin floor", oracle: state({ lateStartMinutes: 17, status: "active" }), integration: { mode: "emulator-state" } },
  { id: "V22", description: "Program din defaults", oracle: schedule(480, undefined, { start: "07:30", end: "16:00", breakStart: "12:30", breakEnd: "13:00" }) },
  { id: "V23", description: "Program fallback hard-coded", oracle: schedule(510) },
  { id: "V24", description: "Prezenta incepe inainte de program", oracle: time([{ start: "07:30", end: "16:30" }], 510) },
  { id: "V25", description: "Plecare la 15:00", oracle: time([{ start: "08:00", end: "15:00" }], 390), classification: "NECONFIRMATA_BUSINESS" },
  { id: "V26", description: "Pauza individuala are precedenta", oracle: time([{ start: "08:00", end: "16:30" }], 480, undefined, { start: "13:00", end: "13:30" }) },
  { id: "V27", description: "Pauza compusa prin fallback per camp", oracle: time([{ start: "08:00", end: "16:30" }], 495, undefined, { start: "13:00", end: "13:15" }) },
  { id: "V28", description: "Cod CO protejat la resync", oracle: state({ code: "CO", entries: 0, protected: true }), ui: true },
  { id: "V29", description: "Cod CFP protejat la resync", oracle: state({ code: "CFP", entries: 0, protected: true }) },
  { id: "V30", description: "Cod CM protejat la resync", oracle: state({ code: "CM", entries: 0, protected: true }) },
  { id: "V31", description: "Cod IN protejat si sumar cerere 2h", oracle: summary({ totalTimpIN: 2 }) },
  { id: "V32", description: "DEL pastreaza codul si primeste Pontaj", oracle: state({ code: "DEL", hours: 8 }) },
  { id: "V33", description: "WE cu interval de 4h", oracle: summary({ c6: 4, presenceHours: 0 }) },
  { id: "V34", description: "SL cu interval de 4h", oracle: summary({ c7: 4, presenceHours: 0 }) },
  { id: "V35", description: "WORK fara entries si fara hours valoreaza zero", oracle: state({ code: "WORK", minutes: 0 }), ui: true },
  { id: "V36", description: "WORK fara entries cu hours=6", oracle: state({ code: "WORK", minutes: 360, overtimeBank: -2 }) },
  { id: "V37", description: "Intrare manuala 08:00-10:00", oracle: time([{ start: "08:00", end: "10:00" }], 120) },
  { id: "V38", description: "Pontaj 10:00-16:00", oracle: time([{ start: "10:00", end: "16:00" }], 330) },
  { id: "V39", description: "Manual 08-10 si Pontaj 10-16", oracle: time([{ start: "08:00", end: "10:00" }, { start: "10:00", end: "16:00" }], 450) },
  { id: "V40", description: "Manual si Pontaj suprapuse, sync client", oracle: time([{ start: "08:00", end: "12:00" }, { start: "10:00", end: "16:00" }], 450), ui: true },
  { id: "V41", description: "Paritate Functions pentru manual si Pontaj suprapuse", oracle: time([{ start: "08:00", end: "12:00" }, { start: "10:00", end: "16:00" }], 450), ui: true, integration: { mode: "functions-trigger" } },
  { id: "V42", description: "Resync repetat este idempotent", oracle: state({ manualEntries: 1, pontajEntries: 1, hours: 7.5 }) },
  { id: "V43", description: "Resync dupa modificarea sessionEnd", oracle: time([{ start: "10:00", end: "15:00" }], 270) },
  { id: "V44", description: "Resync repetat cu sesiuni suprapuse", oracle: time([{ start: "08:00", end: "12:00" }, { start: "11:00", end: "16:00" }], 450) },
  { id: "V45", description: "Pauzele manuale se pastreaza la sync", oracle: time([{ start: "08:00", end: "12:00" }, { start: "13:00", end: "16:00" }], 405, [{ start: "10:00", end: "10:15" }]) },
  { id: "V46", description: "DEL poate pierde metadata whole-day la reconstructie", oracle: state({ code: "DEL", metadataMayBeOmitted: true }), classification: "DEDUSA_DIN_COD" },
  { id: "V47", description: "CO pastreaza integral metadata la resync", oracle: state({ code: "CO", metadataPreserved: true }) },
  { id: "V48", description: "START creeaza sesiune active si lock", oracle: state({ status: "active", lock: "present", timesheet: null }) },
  { id: "V49", description: "employeeId rezolvat prin userUid", oracle: state({ employeeId: "E1", resolution: "userUid" }) },
  { id: "V50", description: "Fallback legacy pe nume si backfill userUid", oracle: state({ employeeId: "E1", backfillUserUid: true }), classification: "NECONFIRMATA_BUSINESS" },
  { id: "V51", description: "Tehnician fara employee produce attendance fara timesheet", oracle: state({ status: "completed", employeeId: null, timesheet: null }) },
  { id: "V52", description: "Admin fara employee este refuzat la START", oracle: state({ rejected: true, attendance: null, lock: null }) },
  { id: "V53", description: "Doua START simultan produc o singura sesiune", oracle: state({ activeSessions: 1, locks: 1 }), classification: "DEDUSA_DIN_COD" },
  { id: "V54", description: "Sesiune active fara lock permite a doua sesiune", oracle: state({ possibleActiveSessions: 2 }), classification: "DEDUSA_DIN_COD", blocking: false },
  { id: "V55", description: "Lock orfan este suprascris", oracle: state({ activeSessions: 1, lockPointsToNewSession: true }) },
  { id: "V56", description: "STOP la 30 secunde este refuzat", oracle: state({ status: "active", lock: "present", timesheet: null }) },
  { id: "V57", description: "STOP exact la 60 secunde este permis", oracle: time([{ start: "08:00", end: "08:01" }], 1, undefined, null), ui: true, integration: { mode: "existing-e2e" } },
  { id: "V58", description: "Doua STOP simultan produc o singura tranzitie", oracle: state({ completedSessions: 1, lock: "absent" }), classification: "DEDUSA_DIN_COD" },
  { id: "V59", description: "Primul QR creeaza auto check-in field", oracle: state({ status: "active", mode: "field", checkInAuto: true, reason: "first_qr" }) },
  { id: "V60", description: "Primul QR este ignorat daca exista pontaj in zi", oracle: state({ skipped: true, reason: "attendance_today" }) },
  { id: "V61", description: "Auto STOP la raport semnat este dezactivat", oracle: state({ status: "active", autoCheckoutEnabled: false }), classification: "NECONFIRMATA_DEPLOYMENT" },
  { id: "V62", description: "Cron EOD inchide la program si sterge lock-ul", oracle: state({ status: "completed", end: "16:30", lock: "absent", hours: 8 }), ui: true, blocking: false },
  { id: "V63", description: "Cron EOD pentru start dupa program inchide la 23:59", oracle: state({ status: "completed", end: "23:59:59.999", lock: "absent" }), ui: true, blocking: false },
  { id: "V64", description: "STOP cross-month este clamp-uit in ziua START", oracle: state({ monthKey: "2026-07", day: "31", end: "23:59:59.999", minutes: 59 }), ui: true },
  { id: "V65", description: "Sesiune legacy cross-month are selectori contradictorii", oracle: state({ bulkMonth: "2026-07", singleMonth: "2026-08" }), classification: "CONTRADICTORIE", blocking: false },
  { id: "V66", description: "DST primavara pastreaza durata absoluta de o ora", oracle: { kind: "timezone", startMs: Date.parse("2026-03-29T00:30:00Z"), endMs: Date.parse("2026-03-29T01:30:00Z"), expectedStart: "02:30", expectedEnd: "04:30", expectedMinutes: 60, expectedMonthKey: "2026-03", expectedDay: "29" }, ui: true },
  { id: "V67", description: "DST toamna pastreaza durata absoluta de o ora", oracle: { kind: "timezone", startMs: Date.parse("2026-10-25T00:30:00Z"), endMs: Date.parse("2026-10-25T01:30:00Z"), expectedStart: "03:30", expectedEnd: "03:30", expectedMinutes: 60, expectedMonthKey: "2026-10", expectedDay: "25" }, ui: true },
  { id: "V68", description: "28 februarie 2026 este valid", oracle: state({ monthKey: "2026-02", day: "28", daysInMonth: 28 }) },
  { id: "V69", description: "29 februarie 2028 este valid", oracle: state({ monthKey: "2028-02", day: "29", daysInMonth: 29 }) },
  { id: "V70", description: "Cross-year este clamp-uit in 2026", oracle: state({ monthKey: "2026-12", day: "31", split: false }) },
  { id: "V71", description: "Browser UTC poate atribui alta zi decat Functions", oracle: state({ browserDay: "31", functionsDay: "1" }), classification: "CONTRADICTORIE", blocking: false },
  { id: "V72", description: "Overtime ADD este cap-uit la 23:59", oracle: state({ minutes: 449, hours: 7.4833 }) },
  { id: "V73", description: "C1/C2/C3 pentru 07:30-17:00", oracle: summary({ presenceHours: 9, c1: 0.5, c2: 0.5, c3: 1, c4: 0, c5: 0, tickets: 1 }), ui: true },
  { id: "V74", description: "C3-C5 pentru 04:00-21:00", oracle: summary({ presenceHours: 16.5, c1: 4, c2: 4.5, c3: 2, c4: 2, c5: 4.5 }), ui: true },
  { id: "V75", description: "Traseu catre client produce C1", oracle: summary({ presenceHours: 8, c1: 1, tickets: 1 }) },
  { id: "V76", description: "Traseu catre casa produce C2", oracle: summary({ presenceHours: 8, c2: 0.75, tickets: 1 }) },
  { id: "V77", description: "Sambata WORK produce C6", oracle: summary({ presenceHours: 4, c6: 4, tickets: 0 }) },
  { id: "V78", description: "Duminica WORK produce C7", oracle: summary({ presenceHours: 4, c7: 4, tickets: 0 }) },
  { id: "V79", description: "Sarbatoare legala produce C7", oracle: summary({ presenceHours: 4, c7: 4, tickets: 0 }) },
  { id: "V80", description: "C6 dubleaza brut intrari duplicate, prezenta foloseste union", oracle: summary({ presenceHours: 4, c6: 8 }), classification: "CONTRADICTORIE", blocking: false, ui: true },
  { id: "V81", description: "Cerere CO aprobata exclude tichetul, nu orele WORK", oracle: summary({ presenceHours: 8, co: 1, tickets: 0 }) },
  { id: "V82", description: "Toate codurile non-empty cresc zileLucrate", oracle: summary({ workDaysLabel: 7, presenceHours: 0, holidayHours: 8 }), classification: "NECONFIRMATA_BUSINESS" },
  { id: "V83", description: "Media raportului include angajatul fara timesheet", oracle: summary({ totalHours: 8, averageHours: 4 }) },
  { id: "V84", description: "Doua zile WORK 8h si 6h dau banca -2h", oracle: summary({ presenceHours: 14, overtimeBank: -2, tickets: 2 }) },
  { id: "V85", description: "Norma individuala neta de 6h produce banca zero", oracle: schedule(360, { start: "08:00", end: "14:30", breakStart: "12:30", breakEnd: "13:00" }), ui: true },
]

const uiIds = new Set(["V01", "V05", "V06", "V08", "V17", "V28", "V35", "V40", "V41", "V57", "V64", "V66", "V67", "V73", "V74", "V80", "V85"])
const nonBlockingIds = new Set(["V54", "V62", "V63", "V65", "V71", "V80"])

export const PONTAJ_VECTORS: PontajVector[] = definitions.map((definition) => {
  const expected = definition.oracle.kind === "state" || definition.oracle.kind === "summary"
    ? definition.oracle.expected
    : definition.oracle.kind === "time" || definition.oracle.kind === "schedule"
      ? { minutes: definition.oracle.expectedMinutes }
      : { minutes: definition.oracle.expectedMinutes, start: definition.oracle.expectedStart, end: definition.oracle.expectedEnd }
  const base: PontajVector = {
    id: definition.id,
    description: definition.description,
    classification: definition.classification ?? "CONFIRMATA_PRIN_COD",
    priority: definition.priority ?? (uiIds.has(definition.id) ? "P0" : "P1"),
    initialData: { fixture: "pontaj-minimal", vectorId: definition.id },
    utcTime: definition.oracle.kind === "timezone" ? new Date(definition.oracle.startMs).toISOString() : null,
    timezone: "Europe/Bucharest",
    schedule: { start: "08:00", end: "16:30", source: "employee" },
    breaks: [defaultBreak],
    attendance: { source: "Pontaj", vectorId: definition.id },
    initialTimesheet: null,
    action: definition.description,
    expectedAttendance: { vectorId: definition.id },
    expectedLock: "not-applicable",
    expectedTimesheet: expected,
    expectedDashboard: expected,
    expectedCondica: expected,
    expectedProfile: expected,
    expectedReport: expected,
    blocking: definition.blocking ?? !nonBlockingIds.has(definition.id),
    classificationReason: `${definition.classification ?? "CONFIRMATA_PRIN_COD"}: ${definition.description}`,
    oracle: definition.oracle,
    integration: definition.integration ?? (definition.oracle.kind === "state" || definition.oracle.kind === "summary"
      ? { mode: "emulator-state", justification: "Proiectie structurala izolata; fluxul complet este rezervat subsetului UI reprezentativ." }
      : { mode: "application-helper" }),
    uiRepresentative: definition.ui ?? uiIds.has(definition.id),
    ...definition.overrides,
  }
  return base
})

export function validatePontajVectorRegistry(vectors: PontajVector[] = PONTAJ_VECTORS) {
  if (vectors.length !== 85) throw new Error(`Expected 85 vectors, received ${vectors.length}`)
  const ids = vectors.map((vector) => vector.id)
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate pontaj vector ID")
  const expectedIds = Array.from({ length: 85 }, (_, index) => `V${String(index + 1).padStart(2, "0")}`)
  const missing = expectedIds.filter((id) => !ids.includes(id as PontajVector["id"]))
  const unknown = ids.filter((id) => !expectedIds.includes(id))
  if (missing.length || unknown.length) throw new Error(`Invalid registry; missing=${missing.join(",")} unknown=${unknown.join(",")}`)
  for (const vector of vectors) {
    if (!vector.classification || !vector.classificationReason || !vector.oracle) {
      throw new Error(`${vector.id} is missing classification or oracle`)
    }
  }
  return true
}

validatePontajVectorRegistry()
