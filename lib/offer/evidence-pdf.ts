import { jsPDF } from "jspdf"
import { ensurePdfFont } from "@/lib/pdf/font-loader"
import { formatUiDate } from "@/lib/utils/time-format"
import type { OfferEvidencePack } from "@/lib/offer/evidence-types"

function safeLine(doc: jsPDF, text: string, x: number, y: number, maxWidth: number) {
  const lines = doc.splitTextToSize(text, maxWidth)
  doc.text(lines, x, y)
  return y + lines.length * 5
}

export async function generateOfferEvidencePdf(pack: OfferEvidencePack): Promise<Blob> {
  const doc = new jsPDF({ unit: "mm", format: "a4" })
  await ensurePdfFont(doc)

  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 14
  const contentWidth = pageWidth - margin * 2
  let y = 18

  doc.setFontSize(16)
  doc.text("Dosar ofertă — proces verbal", margin, y)
  y += 8

  doc.setFontSize(10)
  y = safeLine(doc, `Generat: ${formatUiDate(new Date(pack.generatedAt))}`, margin, y, contentWidth)
  if (pack.lucrareId) y = safeLine(doc, `Tichet ID: ${pack.lucrareId}`, margin, y + 2, contentWidth)
  if (pack.opportunityId) y = safeLine(doc, `Oportunitate ID: ${pack.opportunityId}`, margin, y + 2, contentWidth)
  if (pack.offerId) y = safeLine(doc, `Ofertă ID: ${pack.offerId}`, margin, y + 2, contentWidth)

  y += 6
  doc.setFontSize(12)
  doc.text("Rezumat", margin, y)
  y += 6
  doc.setFontSize(10)

  const summaryLines = [
    pack.summary.sentAt ? `Ultima trimitere înregistrată: ${formatUiDate(pack.summary.sentAt)}` : null,
    pack.summary.sentTo?.length ? `Destinatar: ${pack.summary.sentTo.join(", ")}` : null,
    pack.summary.acceptedAt ? `Acceptat: ${formatUiDate(new Date(pack.summary.acceptedAt))}` : null,
    pack.summary.acceptedByEmail ? `Email verificat: ${pack.summary.acceptedByEmail}` : null,
    pack.summary.offerTotal != null ? `Total: ${Number(pack.summary.offerTotal).toFixed(2)} lei` : null,
    pack.summary.messageId ? `Message ID: ${pack.summary.messageId}` : null,
  ].filter(Boolean) as string[]

  for (const line of summaryLines) {
    y = safeLine(doc, line, margin, y + 2, contentWidth)
  }

  if (pack.missingGlobal?.length) {
    y += 4
    y = safeLine(doc, `Indisponibil (date istorice): ${pack.missingGlobal.join(", ")}`, margin, y, contentWidth)
  }
  if (pack.integrity) {
    y += 4
    y = safeLine(
      doc,
      `Integritate evenimente noi: ${pack.integrity.verified ? "verificată" : "cu avertismente"}`,
      margin,
      y,
      contentWidth,
    )
  }
  if (pack.warnings?.length) {
    y += 6
    doc.setFontSize(12)
    doc.text("Avertismente", margin, y)
    y += 5
    doc.setFontSize(9)
    for (const warning of pack.warnings) {
      if (y > 275) {
        doc.addPage()
        y = 18
      }
      y = safeLine(doc, `- ${warning}`, margin, y + 2, contentWidth)
    }
  }

  y += 8
  doc.setFontSize(12)
  doc.text("Timeline evenimente", margin, y)
  y += 6
  doc.setFontSize(9)

  const sorted = [...pack.timeline].sort((a, b) => {
    const aMs = a.at ? new Date(a.at).getTime() : null
    const bMs = b.at ? new Date(b.at).getTime() : null
    if (aMs == null && bMs == null) return a.id.localeCompare(b.id)
    if (aMs == null) return 1
    if (bMs == null) return -1
    return aMs - bMs
  })

  for (const item of sorted) {
    if (y > 270) {
      doc.addPage()
      y = 18
    }
    const tier = item.dataTier === "complete" ? "Complet" : "Date limitate"
    const when = item.at ? formatUiDate(item.at) : "dată indisponibilă"
    y = safeLine(doc, `${when} — ${item.label} [${tier}]`, margin, y + 3, contentWidth)

    const detailParts: string[] = []
    if (item.available.email) detailParts.push(`email: ${item.available.email}`)
    if (item.available.messageId) detailParts.push(`msg: ${item.available.messageId}`)
    if (item.available.ip) detailParts.push(`ip: ${item.available.ip}`)
    if (item.available.status) detailParts.push(`status: ${item.available.status}`)
    if (item.available.eventHash) detailParts.push(`hash: ${String(item.available.eventHash).slice(0, 16)}...`)
    if (item.available.prevEventHash) detailParts.push(`prev: ${String(item.available.prevEventHash).slice(0, 16)}...`)
    if (item.available.details) detailParts.push(String(item.available.details))
    if (detailParts.length) {
      y = safeLine(doc, detailParts.join(" | "), margin + 4, y + 1, contentWidth - 4)
    }
    if (item.missing?.length) {
      y = safeLine(doc, `Lipsă: ${item.missing.join(", ")}`, margin + 4, y + 1, contentWidth - 4)
    }
    if (item.available.integrityWarning) {
      y = safeLine(doc, `Avertisment: ${String(item.available.integrityWarning)}`, margin + 4, y + 1, contentWidth - 4)
    }
  }

  if (pack.acceptedSnapshot && Array.isArray(pack.acceptedSnapshot.products)) {
    if (y > 240) {
      doc.addPage()
      y = 18
    }
    y += 8
    doc.setFontSize(12)
    doc.text("Snapshot acceptat — linii", margin, y)
    y += 6
    doc.setFontSize(9)
    const products = pack.acceptedSnapshot.products as Array<Record<string, unknown>>
    for (const product of products) {
      if (y > 275) {
        doc.addPage()
        y = 18
      }
      const name = String(product.name || "-")
      const qty = Number(product.quantity || 0)
      const price = Number(product.price || 0)
      y = safeLine(doc, `- ${name} | ${qty} x ${price.toFixed(2)} lei`, margin, y + 2, contentWidth)
    }
  }

  return doc.output("blob")
}
