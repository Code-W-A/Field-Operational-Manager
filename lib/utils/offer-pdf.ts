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
  // Prepared by (author) and date to display at the end
  preparedBy?: string
  preparedAt?: string
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
  doc.setTextColor(255).setFont("helvetica", "bold").setFontSize(12)
  const displayWorkId = (() => {
    const n = (input.numarRaport || '').trim()
    if (n) return n.startsWith('#') ? n : `#${n}`
    return `#${String(input.id)}`
  })()
  const offerNo = typeof input.offerNumber === 'number' && input.offerNumber > 0 ? `-${input.offerNumber}` : ''
  const title = normalize(`Oferta piese si servicii ${displayWorkId}${offerNo}`)
  doc.text(title, M + 4, y + (headerHeight / 2) + 1)
  // Logo (right)
  try {
    const resp = await fetch("/nrglogo.png")
    const blob = await resp.blob()
    const reader = new FileReader()
    const dataUrl: string = await new Promise((resolve) => {
      reader.onload = () => resolve(reader.result as string)
      reader.readAsDataURL(blob)
    })
    const logoW = 24; const logoH = 18
    doc.addImage(dataUrl, "PNG", M + W - logoW - 4, y + (headerHeight - logoH) / 2, logoW, logoH)
  } catch {}
  y += headerHeight + 12
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
    normalize(r.address || "-"),
  ]
  prestRightLines.forEach((t, i) => doc.text(t, M + W, y + 6 + i*5, { align: "right" }))
  y += 6 + Math.max(prestLeftLines.length, prestRightLines.length)*5 + 6

  y += 14
  // Intro paragraph
  doc.setFontSize(10).setFont("helvetica", "normal")
  const equip = input.equipmentName ? `, echipament ${input.equipmentName}` : ""
  const loc = input.locationName ? ` din locatia ${input.locationName}` : ""
  const intro = normalize(`Referitor la lucrarea nr. ${displayWorkId}${equip}${loc} va facem cunoscute costurile aferente pieselor de schimb si serviciilor necesare remedierii dupa cum urmeaza:`)
  const introLines = doc.splitTextToSize(intro, W)
  introLines.forEach((line: string) => {
    checkPage(6)
    doc.text(line, M, y)
    y += 6
  })

  y += 6

  // Products table
  const headers = ["Servicii/Piese", "Cantitate", "Pret unitar", "Suma liniei"]
  const colW = [W - 20 - 24 - 28, 20, 24, 28]
  const xPos: number[] = [M]
  for (let i = 0; i < colW.length; i++) xPos.push(xPos[i] + colW[i])

  // Section title bar (dark blue) like in the sample
  // Small gap before table
  y += 4

  // Column header with blue text (#49649b), no background
  doc.setTextColor(73, 100, 155)
  doc.setFont("helvetica", "bold").setFontSize(10)
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
  doc.setFont("helvetica", "normal").setFontSize(9)
  const items = (input.products || []).map((p) => ({
    name: normalize(p.name || "—"),
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
  
  // Subtotal / Ajustare / Total (blue band background)
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
  doc.setFont("helvetica", "normal").setFontSize(9)
  const valueX = M + W - 5 // values aligned at right edge
  const labelColonX = M + W - 25 // fixed position for all colons (right aligned, very close)
  doc.text("Subtotal:", labelColonX, y, { align: "right" })
  doc.text(`${subtotal.toLocaleString("ro-RO")}`, valueX, y, { align: "right" })
  y += rowHeight
  // Ajustare
  checkPage(lineH2)
  doc.text("Ajustare:", labelColonX, y, { align: "right" })
  doc.text(`${(adj || 0)}%`, valueX, y, { align: "right" })
  y += rowHeight
  // Total lei fara TVA (accentuat)
  checkPage(10)
  doc.setFont("helvetica", "bold").setFontSize(10)
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

  // Prepared by (author and date) directly above footer separator (absolute positioning)
  try {
    const author = normalize(input.preparedBy || "")
    const when = (() => {
      if (input.preparedAt) return normalize(input.preparedAt)
      const d = new Date()
      const dd = String(d.getDate()).padStart(2, '0')
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const yy = String(d.getFullYear())
      return `${dd}.${mm}.${yy}`
    })()
    const line = author ? `Intocmit de ${author} la data de ${when}` : `Intocmit la data de ${when}`
    const footerSepY = PH - 28
    doc.setFontSize(9).setTextColor(0)
    doc.text(line, M, footerSepY - 4)
  } catch {}

  // Footer separator line (moved lower)
  doc.setDrawColor(209, 213, 219)
  doc.line(M, PH - 28, M + W, PH - 28)
  // Footer company info and bank details laid out in three equal columns with wrapping
  y = Math.max(y, PH - 23)
  doc.setFontSize(8)
  doc.setTextColor(41, 72, 143) // footer text - more vibrant blue
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
        yy += 4
      })
    })
  }
  renderColumn(footerLeft, footerColX[0])
  renderColumn(footerMid, footerColX[1])
  renderColumn(footerRight, footerColX[2])

  

  const blob = doc.output("blob")
  return blob
}


