import { jsPDF } from "jspdf"

// Common PDF layout constants used across generators
export const MARGIN = 7 // page margin (mm)
export const CONTENT_WIDTH = 210 - 2 * MARGIN // A4 width minus margins

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
    doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(255, 255, 255)
    doc.text(options.title, MARGIN + 4, currentY + 11)
  }

  currentY += titleBarHeight + 6 // add a small gap below header
  return currentY
}

/**
 * Draws a footer with company info, matching the style from the main report.
 */
export function drawFooter(doc: jsPDF): void {
  const PH = doc.internal.pageSize.getHeight()
  const footerSepY = PH - 28

  // Footer separator
  doc.setDrawColor(0, 0, 0).setLineWidth(0.3)
  doc.line(MARGIN, footerSepY, MARGIN + CONTENT_WIDTH, footerSepY)

  let footerY = footerSepY + 5
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(0, 0, 0)

  const footerColW = CONTENT_WIDTH / 3 - 4
  const footerColX = [MARGIN, MARGIN + CONTENT_WIDTH / 3, MARGIN + (2 * CONTENT_WIDTH) / 3]

  const footerLeft = [
    "NRG Access Systems SRL",
    "Rezervelor Nr 70, Chiajna, Ilfov",
    "Nr. Reg. Com. J23/991/2015",
    "C.I.F. RO3472913",
  ]
  const footerMid = [
    "Telefon: +40 371 494 499",
    "E-mail: office@nrg-acces.ro",
    "Website: www.nrg-acces.ro",
  ]
  const footerRight = [
    "IBAN RO79BTRL0000000000000000", // placeholder to match style
    "Banca Transilvania Sucursala Aviatiei",
  ]

  const renderFooterColumn = (items: string[], x: number) => {
    let yy = footerY
    for (const t of items) {
      const lines = doc.splitTextToSize(t, footerColW)
      lines.forEach((ln: string, idx: number) => {
        doc.text(ln, x + 2, yy + idx * 4.2)
      })
      yy += lines.length * 4.2 + 2
    }
  }

  renderFooterColumn(footerLeft, footerColX[0])
  renderFooterColumn(footerMid, footerColX[1])
  renderFooterColumn(footerRight, footerColX[2])
}


