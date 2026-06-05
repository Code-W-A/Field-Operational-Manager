import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), "utf8")

test("Semnează mai târziu: saves products and stops work time", () => {
  const page = read("app/raport/[id]/page.tsx")
  const start = page.indexOf("const handleFinalizeLater = async () => {")
  const end = page.indexOf("// Funcție pentru salvarea timpului de plecare manual")
  assert.ok(start > -1, "handleFinalizeLater should exist")
  assert.ok(end > start, "handleFinalizeLater block should be detectable")

  const block = page.slice(start, end)
  assert.match(block, /const timpPlecare = now\.toISOString\(\)/)
  assert.match(block, /const dataPlecare = formatDate\(now\)/)
  assert.match(block, /const oraPlecare = formatTime\(now\)/)
  assert.match(block, /durataInterventie = tichet\?\.timpSosire\s*\?\s*calculateDuration\(tichet\.timpSosire, timpPlecare\)/)
  assert.match(block, /statusLucrare: WORK_STATUS\.NO_SIGNATURE/)
  assert.match(block, /products,/)
  assert.match(block, /cauzaPrincipalaDefectId/)
  assert.match(block, /cauzaPrincipalaDefect: failureCauseLabel/)
  assert.match(block, /await updateLucrare\(tichet\.id, updateData\)/)
})

test("Report reopen: non-locked later-sign reports load editable products first", () => {
  const page = read("app/raport/[id]/page.tsx")
  const start = page.indexOf("const snapshotProducts = Array.isArray")
  const end = page.indexOf("// If the work has an email address")
  assert.ok(start > -1, "product loading block should exist")
  assert.ok(end > start, "product loading block should be detectable")

  const block = page.slice(start, end)
  assert.match(block, /processedData\.raportDataLocked && snapshotProducts\.length > 0/)
  assert.match(block, /mainProducts\.length > 0\s*\?\s*mainProducts/)
  assert.match(block, /setProducts\(convertedProducts\)/)
})

test("Generated report snapshot includes latest products and preserves stopped departure time", () => {
  const generator = read("components/report-generator.tsx")
  assert.match(generator, /const savedDeparture = lucrare\.timpPlecare \? new Date\(lucrare\.timpPlecare\) : null/)
  assert.match(generator, /const currentProducts = Array\.isArray\(lucrare\?\.products\) \? lucrare\.products : products/)
  assert.match(generator, /products: \[\.\.\.currentProducts\]/)
  assert.match(generator, /cauzaPrincipalaDefectId: \(lucrareForPDF as any\)\.cauzaPrincipalaDefectId/)
  assert.match(generator, /cauzaPrincipalaDefect: \(lucrareForPDF as any\)\.cauzaPrincipalaDefect/)
  assert.match(generator, /raportDataLocked: true/)
})

test("Raport: finalization requires principal failure cause and stores it", () => {
  const page = read("app/raport/[id]/page.tsx")
  assert.match(page, /Selectați cauza principală a defectului înainte de generarea raportului/)
  assert.match(page, /Selectați cauza principală a defectului înainte de închiderea intervenției/)
  assert.match(page, /cauzaPrincipalaDefectId/)
  assert.match(page, /cauzaPrincipalaDefect: failureCauseLabel/)
  assert.match(page, /<Label htmlFor="cauzaPrincipalaDefect">Cauză principală defect \*<\/Label>/)
})

test("Revizie: QR starts timing, completion saves duration, PDF displays it", () => {
  const sheet = read("components/revision-operations-sheet.tsx")
  const pdf = read("lib/pdf/revision-operations.ts")

  assert.match(sheet, /startIso: now\.toISOString\(\)/)
  assert.match(sheet, /durationMinutes: minutes/)
  assert.match(sheet, /durationText: `\$\{hours\}h \$\{mins\}m`/)
  assert.match(pdf, /equipmentTime\?\.durationText/)
  assert.match(pdf, /Timp lucru: \$\{context\.durationText\}/)
})

test("HR requests: dispatcher and technician can access Cererile mele self-service", () => {
  const nav = read("lib/navigation/nav-items.ts")
  const hrLayout = read("app/dashboard/resurse-umane/layout.tsx")
  const condica = read("app/dashboard/resurse-umane/condica-prezenta/condica-page.tsx")

  assert.match(hrLayout, /allowedRoles=\{\["admin", "dispecer"\]\}/)
  assert.match(condica, /<CreateLeaveRequestDialog/)
  assert.match(condica, /getEmployeeByUserUid/)
  assert.match(nav, /id: "cererile-mele"[\s\S]*isTechnician \|\| flags\.isAdminOrDispatcher/)
})
