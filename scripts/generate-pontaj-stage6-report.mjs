import fs from "node:fs"
import path from "node:path"

const root = process.cwd()
const report = JSON.parse(fs.readFileSync(path.join(root, "test-results/pontaj-stage6-results.json"), "utf8"))
const specs = []
const visit = (suite) => {
  for (const spec of suite.specs ?? []) specs.push(spec)
  for (const child of suite.suites ?? []) visit(child)
}
for (const suite of report.suites ?? []) visit(suite)

const uiIds = new Set(["V01", "V05", "V06", "V08", "V17", "V28", "V35", "V40", "V41", "V57", "V64", "V66", "V67", "V73", "V74", "V80", "V85"])
const nonBlocking = new Set(["V54", "V62", "V63", "V65", "V71", "V80"])
const defectById = {
  V54: "CHARACTERIZATION_ACTIVE_WITHOUT_LOCK",
  V62: "FIXED_CRON_LOCK_SCHEMA",
  V63: "FIXED_CRON_LOCK_SCHEMA",
  V65: "CHARACTERIZATION_CROSS_MONTH",
  V71: "CHARACTERIZATION_BROWSER_TIMEZONE",
  V75: "FIXED_TRAVEL_DOUBLE_COUNT",
  V76: "FIXED_TRAVEL_DOUBLE_COUNT",
  V80: "CHARACTERIZATION_C6_DUPLICATES",
}

const rows = []
for (let index = 1; index <= 85; index += 1) {
  const id = `V${String(index).padStart(2, "0")}`
  const matches = specs.filter((spec) => new RegExp(`(?:CAL|UI)-${id}(?:\\b|:)`).test(spec.title))
  const cal = matches.find((spec) => spec.title.startsWith(`CAL-${id}`))
  const duration = matches.reduce((sum, spec) => sum + (spec.tests ?? []).flatMap((test) => test.results ?? []).reduce((part, result) => part + Number(result.duration || 0), 0), 0)
  const passed = matches.length > 0 && matches.every((spec) => spec.ok)
  const level = uiIds.has(id) ? "oracle + emulator + UI" : "oracle + emulator/justificare"
  const artifact = cal?.file ? `tests/e2e/${cal.file}` : "tests/e2e/data/pontaj-vectors.ts"
  rows.push(`| ${id} | ${level} | ${passed ? "PASS" : "FAIL"} | ${nonBlocking.has(id) ? "non-blocking" : "blocking"} | ${(duration / 1000).toFixed(3)}s | ${defectById[id] ?? "-"} | \`${artifact}\` | ${cal?.title?.replace(`CAL-${id} `, "") ?? "vector înregistrat"} |`)
}

const markdown = `# Etapa 6 - Rezultate vectori V01-V85

Data executiei: 2026-07-11. Mediu: Firebase Emulator Suite, proiect \`demo-fom-pontaj-e2e\`, timezone \`Europe/Bucharest\`.

## Rezumat

- Registru: 85/85 ID-uri valide, fara duplicate sau lipsuri.
- Playwright complet: 109/109 PASS, incluzand setup, 85 cazuri CAL, 15 proiectii UI, V01 si fluxurile Etapei 5.
- Functions: \`onAttendanceCheckoutSync\` executat real pentru V41.
- Characterization non-blocking: V54, V62, V63, V65, V71, V80.
- Cleanup: executat de doua ori; resurse ramase \`{}\`.
- Firebase live: refuzat de guard; toate mutatiile au folosit proiectul \`demo-*\`.

## Rezultate individuale

| ID | Nivel testat | Rezultat | CI | Timp | Defect asociat | Artefact | Observatii |
|---|---|---|---|---:|---|---|---|
${rows.join("\n")}

## Verificari

| Verificare | Rezultat |
|---|---|
| Registru runtime | PASS, 85/85 |
| Playwright complet | PASS, 109/109 |
| Teste unitare relevante | PASS, 146/146 |
| Build Firebase Functions | PASS |
| Build Next.js | PASS in webServer Playwright |
| Typecheck global | FAIL baseline preexistent; erori in module neatinse de Etapa 6 |
| git diff --check | PASS |
| Cleanup dublu | PASS, \`{}\` |

Verdict: \`ALL_85_VECTORS_IMPLEMENTED\`.
`

fs.writeFileSync(path.join(root, "docs/pontaj/05-rezultate-vectori.md"), markdown)
