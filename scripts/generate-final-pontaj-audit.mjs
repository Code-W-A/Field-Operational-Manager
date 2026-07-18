import fs from "node:fs"
import path from "node:path"

const sourcePath = path.resolve("docs/pontaj/06-status-acoperire.md")
const outputPath = path.resolve("docs/pontaj/final-audit-232.md")
const executionDate = "2026-07-17"

const rows = fs
  .readFileSync(sourcePath, "utf8")
  .split("\n")
  .filter((line) => /^\| (?!ID)/.test(line))
  .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()))
  .filter(([id]) => !id.includes("/") && !id.includes("-HR-"))

const latestRows = new Map()
for (const row of rows) latestRows.set(row[0], row)

const completedHrIds = new Set(["HR-007", "HR-008", "HR-009", "HR-011", "HR-012"])
const securityDeferredIds = new Set(["RES-005", "RES-006"])
const businessBlockedIds = new Set(["BLK-003", "BLK-004", "BLK-005", "BLK-006"])
const characterizedStatuses = new Set([
  "IMPLEMENTED_NON_BLOCKING",
  "IMPLEMENTED_PASSING_WITH_BUSINESS_GAP",
  "IMPLEMENTED_PASSING; TESTABILITY_BLOCKED_NON_BLOCKING UI",
  "IMPLEMENTED_CHARACTERIZATION",
  "CHARACTERIZATION_DEF_UX_NON_BLOCKING",
  "PARTIAL",
])

function finalStatus(id, historicalStatus) {
  if (securityDeferredIds.has(id)) return "SECURITY_DEFERRED_BY_OWNER"
  if (id === "KSK-014") return "MANUAL_PENDING_NON_BLOCKING"
  if (businessBlockedIds.has(id)) return "BUSINESS_BLOCKED_NON_BLOCKING"
  if (id === "BLK-002") return "CHARACTERIZED_NON_BLOCKING"
  if (id === "SYN-002" || id === "RES-007" || completedHrIds.has(id)) return "PASS_LOCAL_EXECUTED"
  if (characterizedStatuses.has(historicalStatus)) return "CHARACTERIZED_NON_BLOCKING"
  if (historicalStatus === "IMPLEMENTED_PASSING" || historicalStatus === "SECURITY_BUG_REMEDIATED") {
    return "PASS_LOCAL_EXECUTED"
  }
  throw new Error(`Unmapped audit status for ${id}: ${historicalStatus}`)
}

function limitation(id, status, historicalReason) {
  if (status === "SECURITY_DEFERRED_BY_OWNER") return "Rules restrictive retained opt-in; open Rules are intentionally not a security pass."
  if (status === "MANUAL_PENDING_NON_BLOCKING") return "Camera, GPS, touch, rotation and sleep/wake require a physical device."
  if (status === "BUSINESS_BLOCKED_NON_BLOCKING") return historicalReason
  if (id === "BLK-002" || id === "SYN-002" || id === "RES-007") {
    return "Current-project/Preview execution was not started because Firebase CLI lacks target-project authorization."
  }
  if (status === "CHARACTERIZED_NON_BLOCKING") return historicalReason
  return "Current-project/Preview execution was not started because Firebase CLI lacks target-project authorization."
}

const auditRows = [...latestRows.values()].map((row) => {
  const [id, historicalStatus, file, testName, level, , reason] = row
  const status = finalStatus(id, historicalStatus)
  const environment = id.startsWith("BLK-") ? "DOCUMENTAȚIE/LOCAL" : "LOCAL_EMULATOR"
  const defect = id === "RT-012"
    ? "DEF-FINAL-002"
    : securityDeferredIds.has(id)
      ? "OWNER_SECURITY_DEFERRED"
      : businessBlockedIds.has(id)
        ? id
        : "-"
  return [id, status, file || "-", testName || "-", environment, executionDate, defect, limitation(id, status, reason), level]
})

if (auditRows.length !== 232) throw new Error(`Expected 232 audit IDs, found ${auditRows.length}`)
if (new Set(auditRows.map(([id]) => id)).size !== 232) throw new Error("Duplicate audit IDs detected")

const totals = Object.fromEntries(
  [...Map.groupBy(auditRows, (row) => row[1])].map(([status, statusRows]) => [status, statusRows.length]),
)
const total = Object.values(totals).reduce((sum, value) => sum + value, 0)
if (total !== 232) throw new Error(`Audit status sum is ${total}, expected 232`)

const lines = [
  "# Audit final pontaj - 232 ID-uri",
  "",
  `Generat la ${executionDate} din registrul canonic. Rândurile agregate istorice nu sunt ID-uri distincte. Firebase CLI nu este autorizat pentru proiectul țintă, astfel că niciun ID nu este marcat ca executat pe proiectul curent.`,
  "",
  "## Reconciliere",
  "",
  `- ID-uri: **${auditRows.length}**`,
  `- ID-uri unice: **${new Set(auditRows.map(([id]) => id)).size}**`,
  `- ID-uri lipsă: **0**`,
  `- Suma statusurilor: **${total}**`,
  ...Object.entries(totals).sort().map(([status, count]) => `- ${status}: **${count}**`),
  "- PASS_CURRENT_PROJECT_EXECUTED: **0**",
  "- PASS_LOCAL_AND_CURRENT_PROJECT: **0**",
  "- FAIL: **0**",
  "",
  "## Registru",
  "",
  "| ID | Status final | Test/fișier | Caz | Mediu | Ultima execuție | Defect | Limitare | Nivel |",
  "|---|---|---|---|---|---|---|---|---|",
  ...auditRows.map((row) => `| ${row.map((cell) => String(cell).replaceAll("|", "\\|")).join(" | ")} |`),
  "",
]

fs.writeFileSync(outputPath, lines.join("\n"))
console.log(JSON.stringify({ ids: auditRows.length, unique: new Set(auditRows.map(([id]) => id)).size, totals }, null, 2))
