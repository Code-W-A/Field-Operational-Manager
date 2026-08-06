import fs from "node:fs"
import path from "node:path"
import ExcelJS from "exceljs"
import { jsPDF } from "jspdf"
import { presentAuditEvent } from "@/lib/reports/activity-presentation"
import { formatBucharestDateTime } from "@/lib/reports/date-range"
import type { AuditEvent, AuditValuePresentation, UninvoicedReportRow } from "@/lib/reports/types"

export type ReportExportFormat = "xlsx" | "pdf"

interface ExportResult {
  body: Buffer
  contentType: string
  extension: ReportExportFormat
}

function styleWorksheet(sheet: ExcelJS.Worksheet, widths: number[]) {
  sheet.views = [{ state: "frozen", ySplit: 1 }]
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: widths.length } }
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } }
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } }
    cell.alignment = { vertical: "middle", wrapText: true }
  })
  sheet.getRow(1).height = 28
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width
    sheet.getColumn(index + 1).alignment = { vertical: "top", wrapText: true }
  })
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1 && rowNumber % 2 === 1) {
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } }
      })
    }
  })
}

async function workbookToResult(workbook: ExcelJS.Workbook): Promise<ExportResult> {
  const data = await workbook.xlsx.writeBuffer()
  return {
    body: Buffer.from(data),
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    extension: "xlsx",
  }
}

export async function exportUninvoicedXlsx(rows: UninvoicedReportRow[], generatedAt: Date) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "Field Operational Manager"
  workbook.created = generatedAt
  const sheet = workbook.addWorksheet("Tichete nefacturate")
  sheet.addRow([
    "Nr. tichet",
    "Client",
    "Locație",
    "Tip tichet",
    "Echipament",
    "Data intervenției",
    "Data raportului",
    "Tehnicieni",
    "Status tichet",
    "Status facturare",
    "Vechime (zile)",
  ])
  for (const row of rows) {
    sheet.addRow([
      row.ticketNumber,
      row.client,
      row.location,
      row.workType,
      row.equipment,
      row.interventionDate,
      row.reportDate ? formatBucharestDateTime(row.reportDate) : "—",
      row.technicians.join(", ") || "—",
      row.workStatus,
      row.invoiceStatus,
      row.ageDays,
    ])
  }
  styleWorksheet(sheet, [18, 26, 30, 24, 32, 18, 22, 28, 18, 18, 14])
  const info = workbook.addWorksheet("Informații")
  info.addRows([
    ["Raport", "Tichete nefacturate"],
    ["Generat la", formatBucharestDateTime(generatedAt)],
    ["Număr rezultate", rows.length],
  ])
  return workbookToResult(workbook)
}

function exportedActivityValue(value: AuditValuePresentation) {
  if (!value.items.length) return value.text
  return `${value.text} (${value.items.map((item) => `${item.label}: ${item.value}`).join("; ")})`
}

function activityChanges(input: AuditEvent) {
  const row = presentAuditEvent(input)
  return row.changes
    .map((change) => {
      const display = change.presentation
      if (!display) return ""
      return `${display.label}: ${exportedActivityValue(display.before)} → ${exportedActivityValue(display.after)}`
    })
    .filter(Boolean)
    .join("; ")
}

export async function exportActivityXlsx(rows: AuditEvent[], generatedAt: Date, periodLabel: string) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "Field Operational Manager"
  workbook.created = generatedAt
  const sheet = workbook.addWorksheet("Activitate utilizator")
  sheet.addRow(["Data și ora", "Utilizator", "Rol", "Modul", "Activitate", "Rezultat", "Entitate", "Detalii", "Modificări", "Acoperire"])
  for (const input of rows) {
    const row = presentAuditEvent(input)
    const display = row.presentation!
    sheet.addRow([
      formatBucharestDateTime(row.occurredAt),
      row.actorName,
      row.actorRole || "—",
      display.moduleLabel,
      display.title,
      row.outcome === "success" ? "Reușit" : "Eșuat",
      [row.entityType, display.entityLabel].filter(Boolean).join(": "),
      display.description,
      activityChanges(row),
      row.coverage === "complete" ? "Complet" : "Istoric parțial",
    ])
  }
  styleWorksheet(sheet, [22, 24, 14, 20, 24, 12, 28, 45, 55, 16])
  const info = workbook.addWorksheet("Informații")
  info.addRows([
    ["Raport", "Activitate utilizator"],
    ["Interval", periodLabel],
    ["Generat la", formatBucharestDateTime(generatedAt)],
    ["Număr rezultate", rows.length],
  ])
  return workbookToResult(workbook)
}

interface PdfColumn<T> {
  label: string
  width: number
  value: (row: T) => string
}

function loadPdfFonts(doc: jsPDF) {
  const regularPath = path.join(process.cwd(), "public", "fonts", "NotoSans-Regular.ttf")
  const boldPath = path.join(process.cwd(), "public", "fonts", "NotoSans-Bold.ttf")
  doc.addFileToVFS("NotoSans-Regular.ttf", fs.readFileSync(regularPath).toString("base64"))
  doc.addFont("NotoSans-Regular.ttf", "NotoSans", "normal")
  doc.addFileToVFS("NotoSans-Bold.ttf", fs.readFileSync(boldPath).toString("base64"))
  doc.addFont("NotoSans-Bold.ttf", "NotoSans", "bold")
  doc.setFont("NotoSans", "normal")
}

function renderTablePdf<T>(params: {
  title: string
  subtitle: string
  generatedAt: Date
  rows: T[]
  columns: PdfColumn<T>[]
}): ExportResult {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true })
  loadPdfFonts(doc)
  const margin = 10
  const pageHeight = doc.internal.pageSize.getHeight()
  const headerHeight = 8
  const lineHeight = 3.8
  let y = margin

  const drawReportHeader = () => {
    doc.setFont("NotoSans", "bold")
    doc.setFontSize(15)
    doc.setTextColor(30, 58, 95)
    doc.text(params.title, margin, y)
    y += 6
    doc.setFont("NotoSans", "normal")
    doc.setFontSize(8)
    doc.setTextColor(71, 85, 105)
    doc.text(params.subtitle, margin, y)
    y += 4
    doc.text(`Generat la: ${formatBucharestDateTime(params.generatedAt)} · ${params.rows.length} rezultate`, margin, y)
    y += 6
  }

  const drawTableHeader = () => {
    let x = margin
    doc.setFillColor(30, 58, 95)
    doc.rect(margin, y, params.columns.reduce((sum, column) => sum + column.width, 0), headerHeight, "F")
    doc.setFont("NotoSans", "bold")
    doc.setFontSize(7)
    doc.setTextColor(255, 255, 255)
    for (const column of params.columns) {
      doc.text(column.label, x + 1, y + 5, { maxWidth: column.width - 2 })
      x += column.width
    }
    y += headerHeight
  }

  const newPage = () => {
    doc.addPage("a4", "landscape")
    y = margin
    drawReportHeader()
    drawTableHeader()
  }

  drawReportHeader()
  drawTableHeader()
  params.rows.forEach((row, rowIndex) => {
    const cells = params.columns.map((column) => {
      const text = column.value(row) || "—"
      return doc.splitTextToSize(text, Math.max(4, column.width - 2)).slice(0, 8) as string[]
    })
    const rowHeight = Math.max(7, Math.max(...cells.map((lines) => lines.length)) * lineHeight + 2)
    if (y + rowHeight > pageHeight - 12) newPage()
    if (rowIndex % 2 === 1) {
      doc.setFillColor(241, 245, 249)
      doc.rect(margin, y, params.columns.reduce((sum, column) => sum + column.width, 0), rowHeight, "F")
    }
    let x = margin
    doc.setFont("NotoSans", "normal")
    doc.setFontSize(6.5)
    doc.setTextColor(15, 23, 42)
    cells.forEach((lines, index) => {
      doc.text(lines, x + 1, y + 4)
      x += params.columns[index].width
    })
    y += rowHeight
  })

  const pageCount = doc.getNumberOfPages()
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page)
    doc.setFont("NotoSans", "normal")
    doc.setFontSize(7)
    doc.setTextColor(100, 116, 139)
    doc.text(`Pagina ${page} din ${pageCount}`, doc.internal.pageSize.getWidth() - margin, pageHeight - 5, { align: "right" })
  }
  return { body: Buffer.from(doc.output("arraybuffer")), contentType: "application/pdf", extension: "pdf" }
}

export function exportUninvoicedPdf(rows: UninvoicedReportRow[], generatedAt: Date) {
  return renderTablePdf({
    title: "Tichete nefacturate",
    subtitle: "Situația curentă a tichetelor cu raport generat și facturare nerezolvată",
    generatedAt,
    rows,
    columns: UNINVOICED_PDF_COLUMNS,
  })
}

/** Ordinea coloanelor PDF/XLSX pentru nefacturate — inclusă în teste. */
export const UNINVOICED_PDF_COLUMNS: PdfColumn<UninvoicedReportRow>[] = [
  { label: "Tichet", width: 18, value: (row) => row.ticketNumber },
  { label: "Client", width: 34, value: (row) => row.client },
  { label: "Locație", width: 38, value: (row) => row.location },
  { label: "Tip", width: 30, value: (row) => row.workType },
  { label: "Echipament", width: 36, value: (row) => row.equipment },
  { label: "Intervenție", width: 23, value: (row) => row.interventionDate },
  { label: "Raport", width: 28, value: (row) => (row.reportDate ? formatBucharestDateTime(row.reportDate) : "—") },
  { label: "Tehnicieni", width: 38, value: (row) => row.technicians.join(", ") },
  { label: "Status tichet", width: 25, value: (row) => row.workStatus },
  { label: "Facturare", width: 25, value: (row) => row.invoiceStatus },
  { label: "Zile", width: 12, value: (row) => String(row.ageDays) },
]

export function exportActivityPdf(rows: AuditEvent[], generatedAt: Date, periodLabel: string) {
  const presentedRows = rows.map((row) => presentAuditEvent(row))
  return renderTablePdf({
    title: "Activitate utilizator",
    subtitle: periodLabel,
    generatedAt,
    rows: presentedRows,
    columns: [
      { label: "Data și ora", width: 31, value: (row) => formatBucharestDateTime(row.occurredAt) },
      { label: "Utilizator", width: 31, value: (row) => row.actorName },
      { label: "Modul", width: 24, value: (row) => row.presentation?.moduleLabel || row.module },
      { label: "Activitate", width: 48, value: (row) => row.presentation?.title || row.action },
      { label: "Rezultat", width: 17, value: (row) => (row.outcome === "success" ? "Reușit" : "Eșuat") },
      { label: "Entitate", width: 42, value: (row) => [row.entityType, row.presentation?.entityLabel].filter(Boolean).join(": ") },
      { label: "Detalii", width: 50, value: (row) => row.presentation?.description || row.summary },
      { label: "Modificări", width: 38, value: activityChanges },
    ],
  })
}
