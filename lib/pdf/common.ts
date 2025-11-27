import { jsPDF } from "jspdf"

// Common PDF layout constants used across generators
export const MARGIN = 7 // page margin (mm)
export const CONTENT_WIDTH = 210 - 2 * MARGIN // A4 width minus margins

function normalizeForPdf(text?: string): string {
  if (!text) return ""
  // Normalize to NFC and correct frequent Romanian cedilla/comma confusions
  let t = text.normalize("NFC")
  // Map s-cedilla/ t-cedilla to s-comma-below / t-comma-below
  t = t.replace(/\u015F/g, "\u0219").replace(/\u0163/g, "\u021B")
  return t
}

/**
 * Draws a simple header bar with company color and optional right-aligned logo.
 * Returns the new Y cursor after the header.
 */
export function drawSimpleHeader(
  doc: jsPDF,
  options: {
    title?: string
    logoDataUrl?: string | null
  } = {}
): number {
  const PH = doc.internal.pageSize.getHeight()
  const titleBarHeight = 16
  const titleBarColor: [number, number, number] = [73, 100, 155] // #49649b
  let currentY = MARGIN

  // Background bar
  doc.setFillColor(titleBarColor[0], titleBarColor[1], titleBarColor[2])
  doc.rect(MARGIN, currentY, CONTENT_WIDTH, titleBarHeight, "F")

  // Optional logo on right
  if (options.logoDataUrl) {
    try {
      const logoW = 24
      const logoH = 18
      doc.addImage(
        options.logoDataUrl,
        "PNG",
        MARGIN + CONTENT_WIDTH - logoW - 4,
        currentY + (titleBarHeight - logoH) / 2,
        logoW,
        logoH
      )
    } catch {}
  }

  // Title text on left
  if (options.title) {
    // Folosim familia 'NotoSans' pentru text (diacritice OK)
    try { doc.setFont("NotoSans", "bold") } catch {}
    doc.setFontSize(13).setTextColor(255, 255, 255)
    const title = normalizeForPdf(options.title)
    doc.text(title, MARGIN + 4, currentY + 11)
  }

  currentY += titleBarHeight + 6 // add a small gap below header
  return currentY
}

/**
 * Draws a footer with company info, matching the style from the main report.
 */
export function drawFooter(doc: jsPDF): void {
  const PH = doc.internal.pageSize.getHeight()
  const footerSepY = PH - 18

  // Footer separator gri subțire (stil similar cu chenarul tabelului „Puncte de control”)
  doc.setDrawColor(210, 210, 210).setLineWidth(0.2)
  doc.line(MARGIN, footerSepY, MARGIN + CONTENT_WIDTH, footerSepY)

  let footerY = footerSepY + 3
  // Culoare albastru intens cu nuanță de violet: RGB(30, 70, 180)
  try { doc.setFont("NotoSans", "normal") } catch {}
  doc.setFontSize(7).setTextColor(30, 70, 180)

  const footerColW = CONTENT_WIDTH / 3
  const footerColX = [MARGIN, MARGIN + CONTENT_WIDTH / 3, MARGIN + (2 * CONTENT_WIDTH) / 3]

  // Set explicit Unicode font to ensure diacritics render
  try { doc.setFont("NotoSans", "normal") } catch {}
  // Coloana stânga - informații companie
  doc.text("NRG Access Systems SRL", footerColX[0], footerY)
  doc.text("Rezervelor Nr 70, Chiajna, Ilfov", footerColX[0], footerY + 3.5)
  doc.text("Nr. Reg. Com. J23/991/2015", footerColX[0], footerY + 7)
  doc.text("C.I.F. RO34272913", footerColX[0], footerY + 10.5)

  // Coloana mijloc - contact
  doc.text("Telefon: +40 371 494 499", footerColX[1], footerY)
  doc.text("E-mail: office@nrg-acces.ro", footerColX[1], footerY + 3.5)
  doc.text("Website: www.nrg-acces.ro", footerColX[1], footerY + 7)

  // Coloana dreapta - banking
  doc.text("IBAN: RO79BTRL00000000000000", footerColX[2], footerY)
  doc.text("Banca Transilvania Sucursala Aviației", footerColX[2], footerY + 3.5)
}


