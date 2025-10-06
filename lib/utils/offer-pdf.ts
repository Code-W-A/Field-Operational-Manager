import { jsPDF } from "jspdf"

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
  prestator?: { name?: string; cui?: string; reg?: string; address?: string }
  beneficiar?: { name?: string; cui?: string; reg?: string; address?: string }
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
  const M = 14
  const W = doc.internal.pageSize.getWidth() - 2 * M
  const PH = doc.internal.pageSize.getHeight()
  let y = M

  const checkPage = (need: number) => {
    if (y + need > PH - M) {
      doc.addPage()
      y = M
    }
  }

  // Header ribbon (lighter blue) with title on left and logo on right
  doc.setFillColor(59, 130, 246).rect(M, y, W, 12, "F")
  doc.setTextColor(255).setFont("helvetica", "bold").setFontSize(12)
  const displayWorkId = (() => {
    const n = (input.numarRaport || '').trim()
    if (n) return n.startsWith('#') ? n : `#${n}`
    return `#${String(input.id)}`
  })()
  const offerNo = typeof input.offerNumber === 'number' && input.offerNumber > 0 ? ` • Oferta nr. ${input.offerNumber}` : ''
  const title = `Oferta piese si servicii: "Lucrare nr. ${normalize(displayWorkId)}"${offerNo}`
  doc.text(title, M + 4, y + 7.8)
  // Logo (right)
  try {
    const resp = await fetch("/nrglogo.png")
    const blob = await resp.blob()
    const reader = new FileReader()
    const dataUrl: string = await new Promise((resolve) => {
      reader.onload = () => resolve(reader.result as string)
      reader.readAsDataURL(blob)
    })
    const logoW = 22; const logoH = 12
    doc.addImage(dataUrl, "PNG", M + W - logoW - 4, y + 0.5, logoW, logoH)
  } catch {}
  y += 22
  doc.setTextColor(0)

  // Prestator / Beneficiar (two columns)
  // Format date as DD-MMM-YYYY (e.g., 31-Jul-2025)
  const fmtDate = (() => {
    if (input.date) return input.date
    const d = new Date()
    const day = String(d.getDate()).padStart(2, "0")
    const month = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()]
    const year = d.getFullYear()
    return `${day}-${month}-${year}`
  })()
  const leftW = W/2 - 3
  const rightW = W/2 - 3
  const l = input.prestator || {}
  const r = input.beneficiar || {}
  doc.setFont("helvetica", "bold").setFontSize(9)
  // Left: Prestator
  doc.text("Prestator", M, y)
  doc.setFont("helvetica", "normal")
  const prestLeftLines = [
    normalize(l.name || input.fromCompany || "NRG Access Systems SRL"),
    normalize(l.cui || "RO34722913"),
    normalize(l.address || "Rezervelor 70, Chiajna, Ilfov"),
  ]
  prestLeftLines.forEach((t, i) => doc.text(t, M, y + 6 + i*5))
  // Right: Beneficiar (right-aligned)
  doc.setFont("helvetica", "bold").text("Beneficiar", M + W, y, { align: "right" })
  doc.setFont("helvetica", "normal")
  const prestRightLines = [
    normalize(r.name || input.client || "-"),
    normalize(r.cui || "-"),
    normalize(r.reg || "-"),
    normalize(r.address || "-"),
  ]
  prestRightLines.forEach((t, i) => doc.text(t, M + W, y + 6 + i*5, { align: "right" }))
  y += 6 + Math.max(prestLeftLines.length, prestRightLines.length)*5 + 6

  y += 8
  // Intro paragraph
  doc.setFontSize(10).setFont("helvetica", "normal")
  const equip = input.equipmentName ? `, Echipament: ${input.equipmentName}` : ""
  const loc = input.locationName ? `, Locație: ${input.locationName}` : ""
  const intro = normalize(`Referitor la lucrarea nr. ${displayWorkId}${equip}${loc} va facem cunoscute costurile aferente pieselor si de schimb serviciilor necesare remedierii dupa cum urmeaza:`)
  const introLines = doc.splitTextToSize(intro, W)
  introLines.forEach((line: string) => {
    checkPage(6)
    doc.text(line, M, y)
    y += 6
  })

  // Damages bullet list (optional)
  if (input.damages && input.damages.length) {
    const lead = normalize("Constatarea la fata locului:")
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
  const lead2 = normalize("In urma interventiei costurile sunt urmatoarele:")
  checkPage(6)
  doc.text(lead2, M, y)
  y += 8

  // Products table
  const headers = ["Servicii&Piese", "Cantitate", "Pret unitar", "Suma liniei"]
  const colW = [W - 20 - 24 - 28, 20, 24, 28]
  const xPos: number[] = [M]
  for (let i = 0; i < colW.length; i++) xPos.push(xPos[i] + colW[i])

  // Section title bar (dark blue) like in the sample
  // Small gap before table
  y += 4

  // Column header (no fill, underline)
  doc.setTextColor(0)
  doc.setFont("helvetica", "bold").setFontSize(9)
  headers.forEach((h, i) => doc.text(h, xPos[i] + 2, y + 5))
  y += 8
  doc.setDrawColor(209, 213, 219)
  doc.line(M, y, M + W, y)

  // Rows (only horizontal lines)
  doc.setFont("helvetica", "normal").setFontSize(9)
  const items = (input.products || []).map((p) => ({
    name: normalize(p.name || "—"),
    qty: Number(p.quantity || 0),
    price: Number(p.price || 0),
    total: Number(p.quantity || 0) * Number(p.price || 0),
  }))

  let subtotal = 0
  items.forEach((r) => {
    const lineH = 7
    checkPage(lineH)
    const nameLines = doc.splitTextToSize(r.name, colW[0] - 2)
    const cellH = Math.max(lineH, nameLines.length * 5 + 2)
    doc.text(nameLines, xPos[0] + 2, y + 5)
    doc.text(String(r.qty), xPos[1] + colW[1] - 2, y + 5, { align: "right" })
    doc.text(`${r.price.toLocaleString("ro-RO")}`, xPos[2] + colW[2] - 2, y + 5, { align: "right" })
    doc.text(`${r.total.toLocaleString("ro-RO")}`, xPos[3] + colW[3] - 2, y + 5, { align: "right" })
    y += cellH
    doc.setDrawColor(229, 231, 235)
    doc.line(M, y, M + W, y)
    subtotal += r.total
  })

  // Subtotal / Ajustare / Total (blue band background)
  const lineH2 = 7
  const adj = typeof input.adjustmentPercent === 'number' ? Number(input.adjustmentPercent) : 0
  const totalNoVat = subtotal * (1 - (adj || 0) / 100)
  const rightLabelX = M + W - 60
  const totalsBlockHeight = lineH2 * 3 + 6
  doc.setFillColor(224, 237, 255)
  doc.rect(M, y + 2, W, totalsBlockHeight, "F")
  // Subtotal
  checkPage(lineH2)
  doc.setFont("helvetica", "normal").setFontSize(9)
  doc.text("Subtotal:", rightLabelX, y + 5)
  doc.text(`${subtotal.toLocaleString("ro-RO")}`, M + W - 2, y + 5, { align: "right" })
  y += lineH2
  // Ajustare
  checkPage(lineH2)
  doc.text("Ajustare:", rightLabelX, y + 5)
  doc.text(`${(adj || 0)}%`, M + W - 2, y + 5, { align: "right" })
  y += lineH2
  // Total lei fara TVA (accentuat)
  checkPage(10)
  doc.setFont("helvetica", "bold").setFontSize(10)
  const amountText = `${totalNoVat.toLocaleString("ro-RO")}`
  const amountRightX = M + W - 2
  const gap = 3
  const amountWidth = doc.getTextWidth(amountText)
  const labelRightX = amountRightX - amountWidth - gap
  doc.text("Total insumat LEI fara TVA:", labelRightX, y + 6, { align: "right" })
  doc.text(amountText, amountRightX, y + 6, { align: "right" })
  y += 14

  // Conditions (match sample wording and spacing)
  const vatPercent = typeof input.offerVAT === "number" && input.offerVAT > 0 ? input.offerVAT : 19
  const defaultConds = [
    `Plata: 100% in avans`,
    `Livrare: 30 zile lucratoare de la plata`,
    `Instalare: 3 zile lucratoare de la livrare`,
    // Garantiile nu se mai afișează in oferta
    `Preturile nu includ TVA (${vatPercent}%)`,
  ]
  const conds = (input.conditions && input.conditions.length ? input.conditions : defaultConds).map(normalize)
  doc.setFont("helvetica", "bold").setFontSize(10).text("Termeni si conditii:", M, y)
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

  // Footer separator line
  doc.setDrawColor(209, 213, 219)
  doc.line(M, PH - 40, M + W, PH - 40)
  // Footer company info and bank details laid out in three equal columns with wrapping
  y = Math.max(y, PH - 35)
  doc.setFontSize(8)
  const footerColW = W / 3 - 4
  const footerColX = [M, M + W / 3, M + (2 * W) / 3]
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
    items.forEach((t) => {
      const lines = doc.splitTextToSize(t, footerColW)
      lines.forEach((ln: string) => {
        doc.text(ln, x, yy)
        yy += 5
      })
    })
  }
  renderColumn(footerLeft, footerColX[0])
  renderColumn(footerMid, footerColX[1])
  renderColumn(footerRight, footerColX[2])

  const blob = doc.output("blob")
  return blob
}


