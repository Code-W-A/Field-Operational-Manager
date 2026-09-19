import { writeFile } from "node:fs/promises"
import { buildOfferVersionPdfInput } from "@/lib/work-documents/offer-pdf-input"
import { generateOfferPdf } from "@/lib/utils/offer-pdf"

async function main() {
const input = buildOfferVersionPdfInput({
  lucrareId: "NmrwKOwUaENTTxohWKsN",
  work: {
    numarRaport: "#001813",
    client: "Client verificare",
    persoanaContact: "Contact verificare",
    locatie: "Locație verificare",
    echipament: "Echipament verificare",
    preluatDe: "Liliana Ionescu",
    offerPreparedBy: "Alin Ionescu",
  },
  versionNumber: 1,
  fallbackVatPercent: 21,
  version: {
    savedAt: "2026-09-16T06:21:10.215Z",
    savedBy: "Alin Ionescu",
    total: 100,
    products: [{ name: "Produs verificare", quantity: 1, price: 100, total: 100 }],
    vatPercent: 21,
    adjustmentPercent: 0,
    conditions: ["Plata: conform ofertei", "Livrare: conform ofertei", "Instalare: conform ofertei"],
  },
})

const blob = await generateOfferPdf(input)
await writeFile("tmp/pdfs/oferta_#001813_versiunea_1.pdf", Buffer.from(await blob.arrayBuffer()))
console.log(JSON.stringify({ preparedBy: input.preparedBy, preparedAt: input.preparedAt }))
}

void main()
