import test from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { generateDevizPdf, generateOfferPdf, type OfferPdfInput } from "@/lib/utils/offer-pdf"

const baseInput: OfferPdfInput = {
  id: "op-1",
  numarRaport: "OP.25",
  client: "Client Test SRL",
  products: [
    { name: "Bariera automata 6m", quantity: 1, price: 4200, um: "buc" },
    { name: "Montaj", quantity: 2, price: 400, um: "buc" },
  ],
  offerVAT: 21,
  adjustmentPercent: 0,
}

const optionals: OfferPdfInput["optionalProducts"] = [
  { name: "Iluminat LED pe brat", quantity: 1, price: 465, um: "buc" },
  { name: "Bucla inductiva", quantity: 2, price: 320, um: "buc" },
]

async function pdfBuffer(input: OfferPdfInput) {
  return Buffer.from(await (await generateOfferPdf(input)).arrayBuffer())
}

/** Extrage textul cu poppler; `null` dacă pdftotext nu e instalat pe mașina curentă. */
function extractText(buffer: Buffer): string | null {
  const dir = mkdtempSync(join(tmpdir(), "offer-pdf-"))
  const file = join(dir, "offer.pdf")
  try {
    writeFileSync(file, buffer)
    return execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    throw error
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function readTotalNoVat(text: string): number {
  const match = text.match(/Total insumat LEI fara TVA:\s+([\d.,]+)/)
  assert.ok(match, "PDF-ul trebuie să conțină linia de total")
  return Number(match![1].replace(/\./g, "").replace(",", "."))
}

test("PDF-ul cu opționale este valid și mai mare decât cel fără", async () => {
  const withoutOptionals = await pdfBuffer(baseInput)
  const withOptionals = await pdfBuffer({ ...baseInput, optionalProducts: optionals })

  assert.equal(withOptionals.subarray(0, 4).toString(), "%PDF")
  assert.ok(withOptionals.length > withoutOptionals.length)
})

test("optionalProducts gol sau absent produc documente identice", async () => {
  const withoutField = await pdfBuffer(baseInput)
  const withEmptyField = await pdfBuffer({ ...baseInput, optionalProducts: [] })
  const withOnlyBlankNames = await pdfBuffer({
    ...baseInput,
    optionalProducts: [{ name: "   ", quantity: 1, price: 100 }],
  })

  assert.equal(withEmptyField.length, withoutField.length)
  assert.equal(withOnlyBlankNames.length, withoutField.length)
})

test("devizul acceptă aceleași opționale fără să crape", async () => {
  const blob = await generateDevizPdf({ ...baseInput, optionalProducts: optionals })
  const buffer = Buffer.from(await blob.arrayBuffer())
  assert.equal(buffer.subarray(0, 4).toString(), "%PDF")
})

test("50 de opționale se pagineazǎ fără eroare", async () => {
  const many = Array.from({ length: 50 }, (_, index) => ({
    name: `Optional ${index + 1} cu denumire lunga pentru a forta impartirea pe mai multe randuri in tabel`,
    quantity: index + 1,
    price: 100 + index,
    um: "buc",
  }))
  const buffer = await pdfBuffer({ ...baseInput, optionalProducts: many })
  assert.equal(buffer.subarray(0, 4).toString(), "%PDF")

  const text = extractText(buffer)
  if (text === null) return
  assert.match(text, /Optional 1 /)
  assert.match(text, /Optional 50/)
  assert.match(text, /Termeni și condiții/)
})

test("conținutul PDF: secțiune Opționale cu prețuri, sub totaluri, exclusă din total", async (t) => {
  const withOptionals = extractText(await pdfBuffer({ ...baseInput, optionalProducts: optionals }))
  if (withOptionals === null) {
    t.skip("pdftotext (poppler) nu este instalat")
    return
  }
  const withoutOptionals = extractText(await pdfBuffer(baseInput))!

  assert.match(withOptionals, /Opționale/)
  assert.doesNotMatch(withoutOptionals, /Opționale/)

  assert.match(withOptionals, /Iluminat LED pe brat/)
  assert.match(withOptionals, /Bucla inductiva/)
  assert.match(withOptionals, /465/)
  assert.match(withOptionals, /640/)
  assert.match(withOptionals, /Prețurile de mai sus nu sunt incluse în total\./)

  const totalIndex = withOptionals.indexOf("Total insumat LEI fara TVA")
  const optionalIndex = withOptionals.indexOf("Opționale")
  const termsIndex = withOptionals.indexOf("Termeni și condiții")
  assert.ok(totalIndex < optionalIndex, "secțiunea trebuie să apară după banda de totaluri")
  assert.ok(optionalIndex < termsIndex, "secțiunea trebuie să apară înainte de termeni și condiții")

  assert.equal(readTotalNoVat(withOptionals), 5000)
  assert.equal(readTotalNoVat(withOptionals), readTotalNoVat(withoutOptionals))
})

test("conținutul PDF: discountul se aplică doar pozițiilor, nu opționalelor", async (t) => {
  const text = extractText(await pdfBuffer({ ...baseInput, adjustmentPercent: 5, optionalProducts: optionals }))
  if (text === null) {
    t.skip("pdftotext (poppler) nu este instalat")
    return
  }

  assert.equal(readTotalNoVat(text), 4750)
  assert.match(text, /Subtotal:\s+5\.000/)
  assert.match(text, /465/)
})

test("conținutul PDF: opționalul fără denumire nu este tipărit", async (t) => {
  const text = extractText(
    await pdfBuffer({
      ...baseInput,
      optionalProducts: [...optionals, { name: "  ", quantity: 1, price: 12345, um: "buc" }],
    }),
  )
  if (text === null) {
    t.skip("pdftotext (poppler) nu este instalat")
    return
  }

  assert.match(text, /Opționale/)
  assert.doesNotMatch(text, /12\.345/)
})
