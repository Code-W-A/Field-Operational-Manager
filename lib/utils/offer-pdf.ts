import { jsPDF } from "jspdf"
import { ensurePdfFont } from "@/lib/pdf/font-loader"
import { formatUiDate } from "@/lib/utils/time-format"

export interface OfferItem {
  name: string
  quantity: number
  price: number
  um?: string
}

export interface OfferPdfInput {
  id: string
  // Optional human-readable work number to display instead of the internal id
  numarRaport?: string
  // Sequential offer number for this work (1,2,3...)
  offerNumber?: number
  client: string
  attentionTo?: string
  fromCompany?: string
  date?: string
  damages?: string[]
  products: OfferItem[]
  offerVAT?: number
  conditions?: string[]
  adjustmentPercent?: number
  // Extra display data
  equipmentName?: string
  locationName?: string
  // Prepared by (author) and date to display at the end
  preparedBy?: string
  preparedAt?: string
  prestator?: { name?: string; cui?: string; reg?: string; address?: string }
  beneficiar?: { name?: string; cui?: string; reg?: string; address?: string }
  documentType?: "offer" | "deviz"
}

// Normalize keeping diacritics; fix common cedilla/comma confusions and enforce NFC
function normalizeForPdf(text = ""): string {
  let t = text.normalize("NFC")
  // Map s-cedilla/t-cedilla to s/t with comma below (Romanian)
  t = t.replace(/\u015F/g, "\u0219").replace(/\u0163/g, "\u021B")
  return t
}

function formatDisplayWorkId(input: OfferPdfInput): string {
  const value = String(input.numarRaport || "").trim()
  if (value) return value.startsWith("#") ? value : `#${value}`
  return `#${String(input.id)}`
}

async function getPdfLogoDataUrl(): Promise<string | null> {
  try {
    const resp = await fetch("/nrglogo.png")
    const blob = await resp.blob()
    const reader = new FileReader()
    const dataUrl = await new Promise<string>((resolve) => {
      reader.onload = () => resolve(reader.result as string)
      reader.readAsDataURL(blob)
    })
    return dataUrl
  } catch {
    return null
  }
}

function drawStandardFooter(doc: jsPDF, margin: number, width: number, pageHeight: number) {
  doc.setDrawColor(209, 213, 219)
  doc.line(margin, pageHeight - 28, margin + width, pageHeight - 28)

  const y = pageHeight - 23
  doc.setFontSize(8)
  doc.setTextColor(41, 72, 143)

  const footerColW = width / 3 - 4
  const footerColX = [margin, margin + width / 3, margin + (2 * width) / 3]
  const footerLeft = [
    "NRG Access Systems SRL",
    "Rezervelor Nr 70,",
    "Chiajna, Ilfov",
    "C.I.F. RO34722913",
  ]
  const footerMid = [
    "Telefon: +40 371 49 44 99",
    "E-mail: office@nrg-acces.ro",
    "Website: www.nrg-acces.ro",
  ]
  const footerRight = [
    "IBAN RO79BTRL RON CRT 0294 5948 01",
    "Banca Transilvania Sucursala Aviatiei",
  ]

  const renderColumn = (items: string[], x: number) => {
    let yy = y
    items.forEach((text) => {
      const lines = doc.splitTextToSize(text, footerColW)
      lines.forEach((line: string) => {
        doc.text(line, x, yy)
        yy += 4
      })
    })
  }

  renderColumn(footerLeft, footerColX[0])
  renderColumn(footerMid, footerColX[1])
  renderColumn(footerRight, footerColX[2])
}

async function generatePricingDocumentPdf(input: OfferPdfInput): Promise<Blob> {
  const doc = new jsPDF({ unit: "mm", format: "a4" })
  // Ensure Unicode font is embedded (aliased to 'helvetica')
  try { await ensurePdfFont(doc) } catch {}
  const M = 10
  const W = doc.internal.pageSize.getWidth() - 2 * M
  const PH = doc.internal.pageSize.getHeight()
  let y = M

  const checkPage = (need: number) => {
    if (y + need > PH - M) {
      doc.addPage()
      y = M
    }
  }

  // Header ribbon with title on left and logo on right (#49649b)
  const headerHeight = 16
  doc.setFillColor(73, 100, 155).rect(M, y, W, headerHeight, "F")
  doc.setTextColor(255).setFont("NotoSans", "bold").setFontSize(12)
  const displayWorkId = formatDisplayWorkId(input)
  const offerNo = typeof input.offerNumber === 'number' && input.offerNumber > 0 ? `-${input.offerNumber}` : ''
  const documentLabel = input.documentType === "deviz" ? "Deviz" : "Oferta"
  const title = normalizeForPdf(`${documentLabel} piese și servicii ${displayWorkId}${offerNo}`)
  doc.text(title, M + 4, y + (headerHeight / 2) + 1)
  // Logo (right)
  const logoDataUrl = await getPdfLogoDataUrl()
  if (logoDataUrl) {
    const logoW = 24
    const logoH = 18
    doc.addImage(logoDataUrl, "PNG", M + W - logoW - 4, y + (headerHeight - logoH) / 2, logoW, logoH)
  }
  y += headerHeight + 12
  doc.setTextColor(0)

  // Prestator / Beneficiar (two columns)
  const l = input.prestator || {}
  const r = input.beneficiar || {}
  doc.setFont("NotoSans", "bold").setFontSize(9)
  // Left: Prestator
  doc.text("Prestator", M, y)
  doc.setFont("NotoSans", "normal")
  const prestLeftLines = [
    normalizeForPdf(l.name || input.fromCompany || "NRG Access Systems SRL"),
    normalizeForPdf(l.cui || "RO34722913"),
    normalizeForPdf(l.address || "Rezervelor 70, Chiajna, Ilfov"),
  ]
  prestLeftLines.forEach((t, i) => doc.text(t, M, y + 6 + i*5))
  // Right: Beneficiar (right-aligned)
  doc.setFont("NotoSans", "bold").text("Beneficiar", M + W, y, { align: "right" })
  doc.setFont("NotoSans", "normal")
  const prestRightLines = [
    normalizeForPdf(r.name || input.client || "-"),
    normalizeForPdf(r.cui || "-"),
    normalizeForPdf(r.address || "-"),
  ]
  prestRightLines.forEach((t, i) => doc.text(t, M + W, y + 6 + i*5, { align: "right" }))
  y += 6 + Math.max(prestLeftLines.length, prestRightLines.length)*5 + 6

  y += 14
  // Intro paragraph (displayWorkId already includes e.g. #OP.26 — avoid "nr." + "#" redundancy)
  doc.setFontSize(10).setFont("NotoSans", "normal")
  const equip = input.equipmentName ? `, echipament ${input.equipmentName}` : ""
  const loc = input.locationName ? `, la locația ${input.locationName}` : ""
  const intro = normalizeForPdf(
    `Referitor la lucrarea ${displayWorkId}${equip}${loc} vă facem cunoscute costurile aferente pieselor de schimb și serviciilor necesare remedierii, după cum urmează:`,
  )
  const introLines = doc.splitTextToSize(intro, W)
  introLines.forEach((line: string) => {
    checkPage(6)
    doc.text(line, M, y)
    y += 6
  })

  y += 6

  // Products table
  const headers = ["Denumire", "Cantitate", "Pret unitar", "Suma liniei"]
  const colW = [W - 20 - 24 - 28, 20, 24, 28]
  const xPos: number[] = [M]
  for (let i = 0; i < colW.length; i++) xPos.push(xPos[i] + colW[i])

  // Section title bar (dark blue) like in the sample
  // Small gap before table
  y += 4

  // Column header with blue text (#49649b), no background
  doc.setTextColor(73, 100, 155)
  doc.setFont("NotoSans", "bold").setFontSize(10)
  headers.forEach((h, i) => {
    if (i === 0) {
      // First column (Servicii&Piese) aligned left
      doc.text(h, xPos[i] + 2, y + 5)
    } else {
      // Numeric columns (Cantitate, Pret unitar, Suma liniei) aligned right
      doc.text(h, xPos[i] + colW[i] - 1, y + 5, { align: "right" })
    }
  })
  y += 7
  // Top border line above first table row (match footer separator thickness/color)
  doc.setDrawColor(209, 213, 219).setLineWidth(0.2)
  doc.line(M, y, M + W, y)
  doc.setTextColor(0) // reset to black for body

  // Rows (only horizontal lines)
  doc.setFont("NotoSans", "normal").setFontSize(9)
  const items = (input.products || []).map((p) => ({
    name: normalizeForPdf(p.name || "—"),
    qty: Number(p.quantity || 0),
    price: Number(p.price || 0),
    total: Number(p.quantity || 0) * Number(p.price || 0),
  }))

  let subtotal = 0
  items.forEach((r) => {
    const lineH = 6 // tighter rows
    checkPage(lineH)
    const nameLines = doc.splitTextToSize(r.name, colW[0] - 2)
    const cellH = Math.max(lineH, nameLines.length * 4.5 + 2)
    doc.text(nameLines, xPos[0] + 2, y + 5)
    doc.text(String(r.qty), xPos[1] + colW[1] - 1, y + 5, { align: "right" })
    doc.text(`${r.price.toLocaleString("ro-RO")}`, xPos[2] + colW[2] - 1, y + 5, { align: "right" })
    doc.text(`${r.total.toLocaleString("ro-RO")}`, xPos[3] + colW[3] - 1, y + 5, { align: "right" })
    y += cellH
    // Row separator (match footer separator thickness/color)
    doc.setDrawColor(209, 213, 219).setLineWidth(0.2)
    doc.line(M, y, M + W, y)
    subtotal += r.total
  })

  // Add spacing between table and totals
  y += 6
  
  // Subtotal / discount / Total (blue band background)
  const lineH2 = 7
  const adj = typeof input.adjustmentPercent === 'number' ? Number(input.adjustmentPercent) : 0
  const totalNoVat = subtotal * (1 - (adj || 0) / 100)
  const rightLabelX = M + W - 60
  
  // Calculate total content height with proper spacing
  const rowHeight = 5 // vertical space per text line
  const verticalPad = 1 // minimal padding top and bottom
  const bandHeight = (rowHeight * 3) + (verticalPad * 2) // 3 rows + padding
  
  // Draw blue band with symmetric padding (light version of #49649b)
  doc.setFillColor(220, 227, 240) // very light blue tint
  doc.rect(M, y, W, bandHeight, "F")
  
  // Start text with top padding
  y += verticalPad + 3
  
  // Subtotal
  checkPage(lineH2)
  doc.setTextColor(0, 0, 0) // black text on light background
  doc.setFont("NotoSans", "normal").setFontSize(9)
  const valueX = M + W - 5 // values aligned at right edge
  const labelColonX = M + W - 25 // fixed position for all colons (right aligned, very close)
  doc.text("Subtotal:", labelColonX, y, { align: "right" })
  doc.text(`${subtotal.toLocaleString("ro-RO")}`, valueX, y, { align: "right" })
  y += rowHeight
  // Discount
  checkPage(lineH2)
  doc.text("Discount:", labelColonX, y, { align: "right" })
  doc.text(`${(adj || 0)}%`, valueX, y, { align: "right" })
  y += rowHeight
  // Total lei fara TVA (accentuat)
  checkPage(10)
  doc.setFont("NotoSans", "bold").setFontSize(10)
  const amountText = `${totalNoVat.toLocaleString("ro-RO")}`
  doc.text("Total insumat LEI fara TVA:", labelColonX, y, { align: "right" })
  doc.text(amountText, valueX, y, { align: "right" })
  y += rowHeight + verticalPad + 3
  
  // Reset text color to black
  doc.setTextColor(0, 0, 0)
  
  // Add extra gap before terms
  y += 12

  // Conditions (match sample wording and spacing)
  const vatPercent = typeof input.offerVAT === "number" && input.offerVAT > 0 ? input.offerVAT : 19
  const defaultConds = [
    `Plata: 100% în avans`,
    `Livrare: 30 zile lucrătoare de la plată`,
    `Instalare: 3 zile lucrătoare de la livrare`,
    // Garantiile nu se mai afișează in oferta
    `Prețurile nu includ TVA (${vatPercent}%)`,
  ]
  const conds = (input.conditions && input.conditions.length ? input.conditions : defaultConds).map(normalizeForPdf)
  doc.setFont("NotoSans", "bold").setFontSize(10).text("Termeni și condiții:", M, y)
  y += 6
  doc.setFont("NotoSans", "normal").setFontSize(9)
  conds.forEach((c) => {
    const lines = doc.splitTextToSize("- " + c, W)
    lines.forEach((l: string) => {
      checkPage(6)
      doc.text(l, M, y)
      y += 6
    })
  })

  // Prepared by (author and date) directly above footer separator (absolute positioning)
  try {
    const author = normalizeForPdf(input.preparedBy || "")
    const when = (() => {
      // Always show as "dd mmm yyyy"
      if (input.preparedAt) return normalizeForPdf(formatUiDate(input.preparedAt))
      return normalizeForPdf(formatUiDate(new Date()))
    })()
    const line = author ? `Întocmit de ${author} la data de ${when}` : `Întocmit la data de ${when}`
    const footerSepY = PH - 28
    doc.setFontSize(9).setTextColor(0)
    doc.text(line, M, footerSepY - 4)
  } catch {}

  drawStandardFooter(doc, M, W, PH)

  const blob = doc.output("blob")
  return blob
}

async function generateDevizDocumentPdf(input: OfferPdfInput): Promise<Blob> {
  const doc = new jsPDF({ unit: "mm", format: "a4" })
  try { await ensurePdfFont(doc) } catch {}

  const M = 10
  const W = doc.internal.pageSize.getWidth() - 2 * M
  const PH = doc.internal.pageSize.getHeight()
  const displayWorkId = formatDisplayWorkId(input)
  const prestator = input.prestator || {}
  const beneficiar = input.beneficiar || {}
  const logoDataUrl = await getPdfLogoDataUrl()

  let y = M

  const checkPage = (need: number) => {
    if (y + need > PH - 35) {
      doc.addPage()
      y = M
    }
  }

  const headerHeight = 16
  doc.setFillColor(73, 100, 155).rect(M, y, W, headerHeight, "F")
  doc.setTextColor(255).setFont("NotoSans", "bold").setFontSize(12)
  doc.text(normalizeForPdf(`Deviz de reparatii pentru tichetul ${displayWorkId}`), M + 4, y + (headerHeight / 2) + 1)

  if (logoDataUrl) {
    const logoW = 24
    const logoH = 18
    doc.addImage(logoDataUrl, "PNG", M + W - logoW - 4, y + (headerHeight - logoH) / 2, logoW, logoH)
  }

  y += headerHeight + 14
  doc.setTextColor(0)

  doc.setFont("NotoSans", "bold").setFontSize(9)
  doc.text("Prestator", M, y)
  doc.text("Beneficiar", M + W, y, { align: "right" })

  doc.setFont("NotoSans", "normal")
  const prestatorLines = [
    normalizeForPdf(prestator.name || input.fromCompany || "NRG Access Systems SRL"),
    normalizeForPdf(prestator.cui || prestator.reg || "RO34722913"),
    normalizeForPdf(prestator.address || "Rezervelor 70, Chiajna, Ilfov"),
  ]
  const beneficiarName = normalizeForPdf(beneficiar.name || input.client || "-")

  prestatorLines.forEach((line, index) => doc.text(line, M, y + 6 + index * 5))
  doc.text(beneficiarName, M + W, y + 6, { align: "right" })

  y += 6 + Math.max(prestatorLines.length, 1) * 5 + 20

  doc.setFont("NotoSans", "bold").setFontSize(11)
  const intro = normalizeForPdf(
    `In urma interventiei efectuate conform tichetului ${displayWorkId} va facem cunoscut mai jos devizul de reparatii si detalierea costurilor:`,
  )
  const introLines = doc.splitTextToSize(intro, W - 4)
  introLines.forEach((line: string) => {
    checkPage(6)
    doc.text(line, M, y)
    y += 6
  })

  y += 16

  const headers = ["Denumire", "Cantitate", "Pret unitar", "Suma liniei"]
  const colW = [W - 20 - 24 - 28, 20, 24, 28]
  const xPos: number[] = [M]
  for (let i = 0; i < colW.length; i++) xPos.push(xPos[i] + colW[i])

  doc.setTextColor(73, 100, 155)
  doc.setFont("NotoSans", "bold").setFontSize(10)
  headers.forEach((header, index) => {
    if (index === 0) {
      doc.text(header, xPos[index] + 2, y + 5)
    } else {
      doc.text(header, xPos[index] + colW[index] - 1, y + 5, { align: "right" })
    }
  })
  y += 7

  doc.setDrawColor(209, 213, 219).setLineWidth(0.2)
  doc.line(M, y, M + W, y)
  doc.setTextColor(0)

  const items = (input.products || []).map((product) => ({
    name: normalizeForPdf(product.name || "-"),
    qty: Number(product.quantity || 0),
    price: Number(product.price || 0),
    total: Number(product.quantity || 0) * Number(product.price || 0),
  }))

  let subtotal = 0
  doc.setFont("NotoSans", "normal").setFontSize(9)
  items.forEach((item) => {
    const rowHeight = 6
    checkPage(rowHeight)
    const nameLines = doc.splitTextToSize(item.name, colW[0] - 2)
    const cellHeight = Math.max(rowHeight, nameLines.length * 4.5 + 2)
    doc.text(nameLines, xPos[0] + 2, y + 5)
    doc.text(String(item.qty), xPos[1] + colW[1] - 1, y + 5, { align: "right" })
    doc.text(item.price.toLocaleString("ro-RO"), xPos[2] + colW[2] - 1, y + 5, { align: "right" })
    doc.text(item.total.toLocaleString("ro-RO"), xPos[3] + colW[3] - 1, y + 5, { align: "right" })
    y += cellHeight
    doc.setDrawColor(209, 213, 219).setLineWidth(0.2)
    doc.line(M, y, M + W, y)
    subtotal += item.total
  })

  y += 8

  const adjustment = typeof input.adjustmentPercent === "number" ? Number(input.adjustmentPercent) : 0
  const totalNoVat = subtotal * (1 - adjustment / 100)
  const bandHeight = 18
  const valueX = M + W - 5
  const labelX = M + W - 25

  checkPage(bandHeight + 4)
  doc.setFillColor(220, 227, 240)
  doc.rect(M, y, W, bandHeight, "F")

  y += 4
  doc.setTextColor(0)
  doc.setFont("NotoSans", "normal").setFontSize(9)
  doc.text("Subtotal:", labelX, y, { align: "right" })
  doc.text(subtotal.toLocaleString("ro-RO"), valueX, y, { align: "right" })
  y += 5

  doc.text("Ajustare:", labelX, y, { align: "right" })
  doc.text(`${adjustment}%`, valueX, y, { align: "right" })
  y += 5

  doc.setFont("NotoSans", "bold").setFontSize(10)
  doc.text("Total insumat LEI fara TVA:", labelX, y, { align: "right" })
  doc.text(totalNoVat.toLocaleString("ro-RO"), valueX, y, { align: "right" })

  const preparedBy = normalizeForPdf(String(input.preparedBy || "").trim())
  const preparedAt = normalizeForPdf(formatUiDate(input.preparedAt || new Date()))
  const preparedLine = preparedBy
    ? normalizeForPdf(`Întocmit la data de ${preparedAt} de ${preparedBy}`)
    : normalizeForPdf(`Întocmit la data de ${preparedAt}`)
  const footerSepY = PH - 28
  doc.setFont("NotoSans", "normal").setFontSize(9).setTextColor(0)
  doc.text(preparedLine, M, footerSepY - 4)

  drawStandardFooter(doc, M, W, PH)

  return doc.output("blob")
}

// Generate Offer PDF as Blob using a clean layout
export async function generateOfferPdf(input: OfferPdfInput): Promise<Blob> {
  return generatePricingDocumentPdf({ ...input, documentType: "offer" })
}

export async function generateDevizPdf(input: OfferPdfInput): Promise<Blob> {
  return generateDevizDocumentPdf({ ...input, documentType: "deviz" })
}
