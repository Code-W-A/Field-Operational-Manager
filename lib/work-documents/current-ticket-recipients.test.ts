import test from "node:test"
import assert from "node:assert/strict"
import { freshReinterventionContact, type SyncRecord } from "@/firebase-functions/src/client-ticket-sync"
import { currentTicketRecipients } from "./current-ticket-recipients"
import { ticketEditDraft } from "./ticket-edit-draft"
import { matchesTicketSearchText, ticketListDisplay } from "./ticket-list-display"
import { sendReportSeparately } from "./send-report-separately"

function fixture() {
  const client: SyncRecord = { id: "c", nume: "Firma veche", telefon: "100", email: "office@old.test",
    locatii: [{ id: "l", nume: "Loc vechi", adresa: "Strada veche", email: "loc@old.test",
      persoaneContact: [{ id: "p", nume: "Om vechi", telefon: "200", email: "om@old.test" }] }] }
  const work: SyncRecord = { id: "w", statusLucrare: "Listată", ...freshReinterventionContact(client,
    { clientId: "c", locationId: "l", contactId: "p" }) }
  return { client, work }
}

test("recipient and edit draft use the current client, location and contact", () => {
  const { client, work } = fixture()
  client.nume = "Firma nouă"; client.telefon = "101"; client.email = "office@new.test"
  Object.assign(client.locatii[0], { nume: "Loc nou", adresa: "Strada nouă", email: "loc@new.test" })
  Object.assign(client.locatii[0].persoaneContact[0], { nume: "Om nou", telefon: "201", email: "om@new.test" })
  const saved = structuredClone(work)
  assert.deepEqual(currentTicketRecipients(work, client, "work-order").emails, ["om@new.test", "loc@new.test"])
  assert.deepEqual(currentTicketRecipients(work, client, "postponed").emails, ["office@new.test", "om@new.test"])
  assert.deepEqual(currentTicketRecipients(work, client, "report").emails, ["om@new.test", "loc@new.test", "office@new.test"])
  assert.deepEqual(ticketEditDraft(work, client).fields, {
    client: "Firma nouă", locatie: "Loc nou", persoanaContact: "Om nou", telefon: "201", persoanaContactEmail: "om@new.test",
  })
  const display = ticketListDisplay(work, client)
  assert.equal(matchesTicketSearchText(work, display, "firma nouă"), true)
  assert.equal(matchesTicketSearchText(work, display, "firma veche"), false)
  assert.equal(matchesTicketSearchText(work, display, "loc nou"), true)
  assert.deepEqual(work, saved)
})

test("an invalid ID, deleted contact and ambiguous legacy association fail closed", () => {
  const { client, work } = fixture()
  work.contactId = "missing"
  assert.throws(() => currentTicketRecipients(work, client, "report"), /Contactul/)
  work.contactId = "p"; work.locationId = "missing"
  assert.throws(() => currentTicketRecipients(work, client, "work-order"), /Locația/)
  work.locationId = "l"; work.clientId = "missing"
  assert.throws(() => currentTicketRecipients(work, client, "postponed"), /Clientul/)
  delete work.clientId; delete work.clientInfo.id; delete work.locationId; delete work.clientInfo.locationId; delete work.contactId
  client.locatii.push({ ...client.locatii[0], id: "l2" })
  assert.throws(() => currentTicketRecipients(work, client, "report"), /Locația/)
})

test("manual ticket exception remains visible in edit draft", () => {
  const { client, work } = fixture()
  work.telefon = "999"
  client.locatii[0].persoaneContact[0].telefon = "201"
  const draft = ticketEditDraft(work, client)
  assert.equal(draft.fields.telefon, "999")
  assert.match(draft.issues.join(" "), /Telefon contact/)
})

test("work-order falls back to current main email only when location has no recipients", () => {
  const { client, work } = fixture()
  client.locatii[0].email = ""
  client.locatii[0].persoaneContact[0].email = ""
  client.email = "NEW@EXAMPLE.TEST"
  assert.deepEqual(currentTicketRecipients(work, client, "work-order").emails, ["new@example.test"])
})

test("test transport sends one report per current address and records partial failures", async () => {
  const { client, work } = fixture()
  client.email = "office@new.test"
  client.locatii[0].persoaneContact[0].email = "contact@new.test"
  const recipients = currentTicketRecipients(work, client, "report").emails
  const envelopes: string[] = []
  const delivery = await sendReportSeparately(recipients, async recipient => {
    envelopes.push(recipient)
    if (recipient === "loc@old.test") throw new Error("transport-test failure")
    return { messageId: recipient }
  })
  assert.deepEqual(envelopes, ["contact@new.test", "loc@old.test", "office@new.test"])
  assert.deepEqual(delivery.sent, ["contact@new.test", "office@new.test"])
  assert.deepEqual(delivery.failed, ["loc@old.test"])
})
