import { NextResponse, type NextRequest } from "next/server"
import { RequireRoleError, requireVerifiedRole } from "@/lib/auth/require-role"
import { formatBucharestFileStamp, parseActivityDateRange } from "@/lib/reports/date-range"
import { writeServerAuditEvent } from "@/lib/reports/audit-writer.server"
import {
  MAX_EXPORT_ROWS,
  loadAllActivityRows,
  loadAllUninvoicedRows,
} from "@/lib/reports/report-data.server"
import {
  exportActivityPdf,
  exportActivityXlsx,
  exportUninvoicedPdf,
  exportUninvoicedXlsx,
  type ReportExportFormat,
} from "@/lib/reports/report-export.server"

export const dynamic = "force-dynamic"
export const maxDuration = 60

function downloadResponse(result: { body: Buffer; contentType: string; extension: string }, fileName: string) {
  return new NextResponse(new Uint8Array(result.body), {
    status: 200,
    headers: {
      "Content-Type": result.contentType,
      "Content-Disposition": `attachment; filename="${fileName}.${result.extension}"`,
      "Cache-Control": "private, no-store",
    },
  })
}

export async function GET(request: NextRequest) {
  try {
    const actor = await requireVerifiedRole(["admin"], request)
    const params = request.nextUrl.searchParams
    const reportType = params.get("report")
    const format = params.get("format") as ReportExportFormat
    if (format !== "xlsx" && format !== "pdf") {
      return NextResponse.json({ error: "Formatul trebuie să fie xlsx sau pdf." }, { status: 400 })
    }

    const generatedAt = new Date()
    if (reportType === "uninvoiced") {
      const loaded = await loadAllUninvoicedRows({
        search: params.get("search") || "",
        client: params.get("client") || "",
        workType: params.get("workType") || "",
        workStatus: params.get("workStatus") || "",
      })
      if (loaded.filteredRows.length > MAX_EXPORT_ROWS) {
        return NextResponse.json({ error: `Exportul este limitat la ${MAX_EXPORT_ROWS} de rânduri.` }, { status: 400 })
      }
      const result = format === "xlsx"
        ? await exportUninvoicedXlsx(loaded.filteredRows, generatedAt)
        : exportUninvoicedPdf(loaded.filteredRows, generatedAt)
      await writeServerAuditEvent({
        actorId: actor.uid,
        module: "Rapoarte",
        action: "Export raport",
        entityType: "Raport",
        entityId: "tichete-nefacturate",
        entityLabel: "Tichete nefacturate",
        summary: `Export ${format.toUpperCase()} cu ${loaded.filteredRows.length} tichete nefacturate.`,
      })
      return downloadResponse(result, `tichete-nefacturate_${formatBucharestFileStamp(generatedAt)}`)
    }

    if (reportType === "activity") {
      const userId = String(params.get("userId") || "").trim()
      const from = String(params.get("from") || "").trim()
      const to = String(params.get("to") || "").trim()
      if (!userId || !from || !to) {
        return NextResponse.json({ error: "Utilizatorul și intervalul sunt obligatorii." }, { status: 400 })
      }
      parseActivityDateRange(from, to)
      const loaded = await loadAllActivityRows({ userId, from, to })
      if (loaded.rows.length > MAX_EXPORT_ROWS) {
        return NextResponse.json({ error: `Exportul este limitat la ${MAX_EXPORT_ROWS} de rânduri.` }, { status: 400 })
      }
      const periodLabel = `Interval: ${from} – ${to}`
      const result = format === "xlsx"
        ? await exportActivityXlsx(loaded.rows, generatedAt, periodLabel)
        : exportActivityPdf(loaded.rows, generatedAt, periodLabel)
      await writeServerAuditEvent({
        actorId: actor.uid,
        module: "Rapoarte",
        action: "Export raport",
        entityType: "Raport",
        entityId: "activitate-utilizator",
        entityLabel: userId,
        summary: `Export ${format.toUpperCase()} al activității utilizatorului pentru ${from} – ${to}, ${loaded.rows.length} evenimente.`,
      })
      return downloadResponse(result, `activitate-utilizator_${from}_${to}`)
    }

    return NextResponse.json({ error: "Tip de raport invalid." }, { status: 400 })
  } catch (error) {
    const status = error instanceof RequireRoleError ? error.status : error instanceof Error ? 400 : 500
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Exportul nu a putut fi generat." },
      { status },
    )
  }
}
