import { jsPDF } from "jspdf"

export interface OfferItem {
  name: string
  quantity: number
  price: number
  um?: string
}

export interface OfferPdfInput {
  id: string
  client: string
  attentionTo?: string
  fromCompany?: string
  date?: string
  damages?: string[]
  products: OfferItem[]
  offerVAT?: number
  conditions?: string[]
}

// Helper to strip diacritics for built-in Helvetica
const normalize = (text = "") =>
  text.replace(
    /[ăâîșțĂÂÎȘȚ]/g,
    (c) => (({ ă: "a", â: "a", î: "i", ș: "s", ț: "t", Ă: "A", Â: "A", Î: "I", Ș: "S", Ț: "T" }) as any)[c],
  )

// Generate Offer PDF as Blob using a clean layout
export async function generateOfferPdf(input: OfferPdfInput): Promise<Blob> {
  const doc = new jsPDF({ unit: "mm", format: "a4" })
  const M = 15
  const W = doc.internal.pageSize.getWidth() - 2 * M
  const PH = doc.internal.pageSize.getHeight()
  let y = M

  const checkPage = (need: number) => {
    if (y + need > PH - M) {
      doc.addPage()
      y = M
    }
  }

  // Try to render NRG logo in top-right corner
  try {
    const logoUrl = "/nrglogo.png"
    // Fetch as blob -> dataURL for consistency across browsers
    const resp = await fetch(logoUrl)
    const blob = await resp.blob()
    const reader = new FileReader()
    const dataUrl: string = await new Promise((resolve) => {
      reader.onload = () => resolve(reader.result as string)
      reader.readAsDataURL(blob)
    })
    // Place logo area ~32x14mm
    doc.addImage(dataUrl, "PNG", M + W - 36, y - 2, 32, 14)
  } catch {}

  // Header table (CĂTRE / ÎN ATENȚIA / DE LA / DATA)
  const headerRows: Array<[string, string]> = [
    ["CATRE:", normalize(input.client || "-")],
    ["IN ATENTIA:", normalize(input.attentionTo || "-")],
    ["DE LA:", normalize(input.fromCompany || "NRG Access Systems SRL")],
    ["DATA:", input.date || new Date().toLocaleDateString("ro-RO", { day: "2-digit", month: "short", year: "numeric" })],
  ]

  doc.setFont("helvetica", "bold").setFontSize(9)
  const col1 = 30
  const rowH = 7
  headerRows.forEach(([l, v], i) => {
    checkPage(rowH)
    doc.rect(M, y, col1, rowH)
    doc.rect(M + col1, y, W - col1, rowH)
    doc.text(l, M + 2.5, y + 4.7)
    doc.setFont("helvetica", "normal")
    doc.text(v, M + col1 + 2.5, y + 4.7)
    doc.setFont("helvetica", "bold")
    y += rowH
  })

  y += 8
  // Intro paragraph
  doc.setFontSize(10).setFont("helvetica", "normal")
  const intro = normalize(
    "Buna ziua,\n\nIn cele ce urmeaza va voi face cunoscuta oferta noastra pentru remedierea usii sectionale Horman accidentata.",
  )
  const introLines = doc.splitTextToSize(intro, W)
  introLines.forEach((line: string) => {
    checkPage(6)
    doc.text(line, M, y)
    y += 6
  })

  // Damages bullet list (optional)
  if (input.damages && input.damages.length) {
    const lead = normalize("In urma loviturii usa a suferit urmatoarele deteriorari:")
    checkPage(6)
    doc.text(lead, M, y)
    y += 6
    input.damages.forEach((d) => {
      const txt = "- " + normalize(d)
      const lines = doc.splitTextToSize(txt, W - 6)
      lines.forEach((l: string) => {
        checkPage(5)
        doc.text(l, M + 4, y)
        y += 5
      })
    })
  }

  y += 6
  const lead2 = normalize("In vederea remedierii usii costurile sunt urmatoarele:")
  checkPage(6)
  doc.text(lead2, M, y)
  y += 8

  // Products table
  const headers = ["Nr", "Denumire", "Buc", "PU", "Total"]
  const colW = [10, W - 10 - 20 - 20 - 22, 20, 20, 22]
  const xPos: number[] = [M]
  for (let i = 0; i < colW.length; i++) xPos.push(xPos[i] + colW[i])

  // Section title bar (dark blue) like in the sample
  doc.setFillColor(28, 79, 140).rect(M, y, W, 8, "F")
  doc.setTextColor(255)
  doc.setFont("helvetica", "bold").setFontSize(10)
  doc.text("Calcul costuri remediere usa Novum", M + W / 2, y + 5.2, { align: "center" })
  y += 8

  // Column header with light blue background
  doc.setTextColor(0)
  doc.setFillColor(224, 237, 255).rect(M, y, W, 8, "F")
  doc.setFont("helvetica", "bold").setFontSize(9)
  headers.forEach((h, i) => doc.text(h, xPos[i] + 2, y + 5))
  y += 8

  // Rows
  doc.setFont("helvetica", "normal").setFontSize(9)
  const items = (input.products || []).map((p, idx) => ({
    nr: String(idx + 1),
    name: normalize(p.name || "—"),
    qty: Number(p.quantity || 0),
    price: Number(p.price || 0),
    total: Number(p.quantity || 0) * Number(p.price || 0),
  }))

  let subtotal = 0
  items.forEach((r) => {
    const lineH = 7
    checkPage(lineH)
    doc.text(r.nr, xPos[0] + 2, y + 5)
    const nameLines = doc.splitTextToSize(r.name, colW[1] - 2)
    const cellH = Math.max(lineH, nameLines.length * 5 + 2)
    // borders per row height
    doc.rect(M, y, W, cellH)
    doc.text(nameLines, xPos[1] + 2, y + 5)
    doc.text(String(r.qty), xPos[2] + 2, y + 5)
    doc.text(`${r.price.toLocaleString("ro-RO")} €`, xPos[3] + 2, y + 5)
    doc.text(`${r.total.toLocaleString("ro-RO")} €`, xPos[4] + 2, y + 5)
    y += cellH
    subtotal += r.total
  })

  // Total row
  checkPage(8)
  doc.setFillColor(199, 230, 203).rect(M, y, W, 8, "F")
  doc.setFont("helvetica", "bold").setFontSize(10)
  doc.text("Total EURO fara TVA", xPos[0] + 2, y + 5)
  doc.text(`${subtotal.toLocaleString("ro-RO")} €`, xPos[4] + 2, y + 5)
  y += 14

  // Conditions
  const vatPercent = typeof input.offerVAT === "number" && input.offerVAT > 0 ? input.offerVAT : 19
  const defaultConds = [
    `Plata: 100% in avans`,
    `Livrare: 30 zile lucratoare de la plata`,
    `Instalare: 3 zile lucratoare de la livrare`,
    `Garantie: 12 luni`,
    `Preturile nu includ TVA (${vatPercent}%)`,
  ]
  const conds = (input.conditions && input.conditions.length ? input.conditions : defaultConds).map(normalize)
  doc.setFont("helvetica", "bold").setFontSize(10).text("Conditii:", M, y)
  y += 6
  doc.setFont("helvetica", "normal").setFontSize(9)
  conds.forEach((c) => {
    const lines = doc.splitTextToSize("- " + c, W)
    lines.forEach((l: string) => {
      checkPage(6)
      doc.text(l, M, y)
      y += 6
    })
  })

  // Footer company info and bank details (two columns)
  y = Math.max(y, PH - 35)
  doc.setFontSize(8)
  const leftX = M
  const rightX = M + W / 2 + 5
  const leftLines = [
    "NRG Access Systems SRL",
    "Rezervelor Nr 70,",
    "Chiajna, Ilfov",
    "Nr. Reg Com J23/991/2015   C.I.F. RO34722913",
  ]
  const midLines = [
    "Telefon:    +40 371 49 44 99",
    "E-mail:      office@nrg-acces.ro",
    "Website:   www.nrg-acces.ro",
  ]
  const rightLines = [
    "IBAN RO79BTRL RON CRT 0294 5948 01",
    "Banca Transilvania Sucursala Aviatiei",
  ]
  leftLines.forEach((l, i) => doc.text(l, leftX, y + i * 5))
  midLines.forEach((l, i) => doc.text(l, leftX + 65, y + i * 5))
  rightLines.forEach((l, i) => doc.text(l, rightX, y + i * 5))

  const blob = doc.output("blob")
  return blob
}


