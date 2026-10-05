import assert from "node:assert/strict"
import { test } from "node:test"
import { canResendReport, resolveResendRecipients, validateResendEmails } from "./report-resend"
import { sendReportSeparately } from "./send-report-separately"

const client = { id: "c1", nume: "Nume actual", email: "Main@Example.invalid", locatii: [{ id: "l1", nume: "Locație actuală", email: "local@example.invalid", persoaneContact: [{ email: "contact@example.invalid" }, { email: "MAIN@example.invalid" }] }] }
const work = { clientId: "c1", locationId: "l1", client: "Nume vechi", locatie: "Locație veche", persoanaContactEmail: "old@example.invalid", reportManualRecipients: ["manual@example.invalid"], lastReportEmail: { to: ["last@example.invalid"] }, raportSnapshot: { clientSnapshot: { persoanaContactEmail: "frozen@example.invalid" } } }
test("resend resolves renamed client/location by stable IDs and uses current emails only", () => {
  assert.deepEqual(resolveResendRecipients(work, [client]), { source: "current", emails: ["contact@example.invalid", "main@example.invalid", "local@example.invalid"] })
})
test("resend resolves legacy names only on exact unique matches", () => {
  const legacy = { ...work, clientId: undefined, locationId: undefined, client: client.nume, locatie: client.locatii[0].nume }
  assert.equal(resolveResendRecipients(legacy, [client]).source, "current")
  assert.equal(resolveResendRecipients(legacy, [client, { ...client, id: "c2" }]).source, "historical")
  assert.equal(resolveResendRecipients({ ...legacy, locatie: "missing" }, [client]).source, "historical")
})
test("invalid stable IDs never switch to name matching or historical defaults", () => {
  assert.equal(resolveResendRecipients({ ...work, clientId: "missing", client: client.nume }, [client]).source, "none")
  assert.deepEqual(resolveResendRecipients(work, []).emails, [])
  assert.deepEqual(resolveResendRecipients({ ...work, locationId: "missing" }, [client]).emails, [])
})
test("legacy fallback prefers frozen report contact then ticket contact, excludes previous recipients", () => {
  const legacy = { ...work, clientId: undefined, locationId: undefined }
  assert.deepEqual(resolveResendRecipients(legacy, []).emails, ["frozen@example.invalid"])
  assert.deepEqual(resolveResendRecipients({ ...legacy, raportSnapshot: {} }, []).emails, ["old@example.invalid"])
  assert.equal(resolveResendRecipients({ reportManualRecipients: ["manual@example.invalid"], lastReportEmail: { to: ["last@example.invalid"] } }, []).source, "none")
})
test("chosen exact list supports one address, normalized duplicates, rejects empty/invalid/over limit", () => {
  assert.deepEqual(validateResendEmails([" ONE@EXAMPLE.INVALID ", "one@example.invalid"]), ["one@example.invalid"])
  for (const invalid of [[], ["bad"], ["a@b.invalid,c@d.invalid"], Array(21).fill("a@b.invalid"), null]) assert.throws(() => validateResendEmails(invalid))
})
test("only existing standard/legacy reports and revisions can be resent", () => {
  assert.ok(canResendReport({ raportGenerat: true, tipLucrare: "Revizie" }))
  assert.ok(canResendReport({ raportGenerat: true, tipLucrare: "Instalare" }))
  assert.ok(!canResendReport({ raportGenerat: false }))
  assert.ok(!canResendReport({ raportGenerat: true, tipLucrare: "Instalare", installation: { schemaVersion: 1 } }))
})
test("separate delivery returns exact sent/failed recipients and supports failed-only retry", async () => {
  const calls: string[] = []
  const result = await sendReportSeparately(["one@example.invalid", "fail@example.invalid"], async email => {
    calls.push(email); if (email.startsWith("fail")) throw new Error("Simulated failure"); return { messageId: "simulated" }
  })
  assert.deepEqual(calls, ["one@example.invalid", "fail@example.invalid"])
  assert.deepEqual(result.sent, ["one@example.invalid"])
  const retry = await sendReportSeparately(result.failed, async email => { calls.push(email); return {} })
  assert.deepEqual(retry.sent, ["fail@example.invalid"])
  assert.equal(calls.filter(email => email === "one@example.invalid").length, 1)
})
