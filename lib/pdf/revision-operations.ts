import { jsPDF } from "jspdf"
import { collection, doc, getDoc, getDocs } from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { drawSimpleHeader, drawFooter, MARGIN, CONTENT_WIDTH } from "./common"
import { ensurePdfFont } from "./font-loader"

type RevisionItem = {
  id: string
  label?: string
  name?: string
  state?: "functional" | "nefunctional" | "na"
  obs?: string
}

type RevisionSection = {
  id: string
  title?: string
  name?: string
  items?: RevisionItem[]
}

type RevisionDoc = {
  id: string
  equipmentId: string
  equipmentName?: string
  name?: string
  title?: string
  label?: string
  checklistName?: string
  templateName?: string
  templateTitle?: string
  revision?: any
  dynamicSettings?: Record<string, any>
  sections?: RevisionSection[]
}

type RevisionSheetContext = {
  client: string
  location: string
  equipment: string
}

type ChecklistLayout = {
  rowH: number
  totalW: number
  firstColW: number
  verW: number
  obsW: number
}

function resolveHeaderLabel(rev: any, sections: RevisionSection[]): string {
  const candidates: (string | undefined)[] = [
    rev?.headerOverride,
    rev?.templateTitle,
    rev?.templateName,
    rev?.checklistName,
    rev?.label,
    rev?.title,
    rev?.name,
    rev?.dynamicSettings?.["revision.checklistParentName"],
    rev?.dynamicSettings?.["revision.templateName"],
    rev?.dynamicSettings?.["revision.checklistName"],
    rev?.["revision.checklistParentName"],
    rev?.["revision.templateName"],
    rev?.["revision.checklistName"],
    rev?.revision?.templateName,
    rev?.revision?.checklistName,
    rev?.equipmentName,
  ]

  const firstNonRoot = sections.find((s: any) => !String(s?.id || "").endsWith("__root"))
  const firstRoot = sections.find((s: any) => String(s?.id || "").endsWith("__root"))
  const sectionFallback =
    (firstNonRoot?.title || firstNonRoot?.name) ||
    (firstRoot && Array.isArray(firstRoot.items) && firstRoot.items.length > 0
      ? (firstRoot.items[0]?.label || firstRoot.items[0]?.name)
      : undefined)

  return normalizeTextForPdf(
    candidates.find((v) => v && String(v).trim().length > 0) ||
      sectionFallback ||
      "Nivel 2 — Fie categorii, fie variabile",
  )
}

// Helper pentru normalizare text cu diacritice corecte
function normalizeTextForPdf(text = ""): string {
  let s = text.normalize("NFC")
  s = s.replace(/\u015F/g, "\u0219").replace(/\u0163/g, "\u021B")
  return s
}

function buildEquipmentSheetHeaderTitle(level2Label: string, sheetNumberLabel?: string): string {
  if (sheetNumberLabel && String(sheetNumberLabel).trim().length > 0) {
    return `Fișa nr. ${sheetNumberLabel} – Lista operațiuni – ${level2Label}`
  }
  return `Lista operațiuni – ${level2Label}`
}

function buildWorkNumberBase(work: any, fallbackId: string): string {
  const raw = firstNonEmpty([work?.nrLucrare, work?.numarRaport, fallbackId]).replace(/^#\s*/, "").trim()
  if (/^\d+$/.test(raw)) return raw.padStart(6, "0")
  return raw || "000000"
}

function toCleanString(value: unknown): string {
  if (value === null || value === undefined) return ""
  return String(value).trim()
}

function firstNonEmpty(values: unknown[]): string {
  for (const value of values) {
    const str = toCleanString(value)
    if (str) return str
  }
  return ""
}

function normalizeSearchKey(value: unknown): string {
  return toCleanString(value).toLowerCase()
}

function resolveRevisionContext(work: any, rev: any, fallbackEquipmentId?: string): RevisionSheetContext {
  const client = firstNonEmpty([
    work?.client,
    work?.clientInfo?.nume,
    work?.clientInfo?.name,
    work?.clientInfo?.client,
    work?.clientInfo?.clientName,
  ]) || "-"

  const location = firstNonEmpty([
    work?.locatie,
    work?.locationName,
    work?.clientInfo?.locationName,
    work?.clientInfo?.locationAddress,
    work?.clientInfo?.locatie,
    work?.clientInfo?.location,
  ]) || "-"

  const targetKeys = new Set(
    [
      rev?.equipmentId,
      rev?.equipmentCode,
      fallbackEquipmentId,
      rev?.id,
      work?.echipamentId,
      work?.echipamentCod,
    ]
      .map(normalizeSearchKey)
      .filter(Boolean),
  )

  const revisionEquipmentList = Array.isArray(work?.revision?.equipment) ? work.revision.equipment : []
  const revisionEquipmentMatch = revisionEquipmentList.find((item: any) => {
    const keys = [
      item?.equipmentId,
      item?.equipmentCode,
      item?.id,
      item?.cod,
    ]
      .map(normalizeSearchKey)
      .filter(Boolean)
    return keys.some((k: string) => targetKeys.has(k))
  })

  const clientInfo = work?.clientInfo
  const locationEquipments = Array.isArray(clientInfo?.locatii)
    ? clientInfo.locatii.flatMap((loc: any) => (Array.isArray(loc?.echipamente) ? loc.echipamente : []))
    : []
  const directEquipments = Array.isArray(clientInfo?.echipamente) ? clientInfo.echipamente : []
  const allClientEquipments = [...locationEquipments, ...directEquipments]

  const clientEquipmentMatch = allClientEquipments.find((item: any) => {
    const keys = [
      item?.equipmentId,
      item?.equipmentCode,
      item?.id,
      item?.cod,
    ]
      .map(normalizeSearchKey)
      .filter(Boolean)
    return keys.some((k: string) => targetKeys.has(k))
  })

  const equipment = firstNonEmpty([
    rev?.equipmentName,
    rev?.equipmentLabel,
    rev?.name,
    rev?.title,
    rev?.label,
    revisionEquipmentMatch?.equipmentName,
    revisionEquipmentMatch?.name,
    revisionEquipmentMatch?.title,
    revisionEquipmentMatch?.label,
    clientEquipmentMatch?.nume,
    clientEquipmentMatch?.name,
    clientEquipmentMatch?.model,
    work?.echipament,
    fallbackEquipmentId,
    rev?.equipmentId,
    rev?.id,
  ]) || "-"

  return { client, location, equipment }
}

function splitTextToSizeClamped(pdf: jsPDF, text: string, width: number, maxLines = 3): string[] {
  const source = normalizeTextForPdf(text || "-")
  const raw = pdf.splitTextToSize(source, Math.max(1, width))
  const lines = (Array.isArray(raw) ? raw : [String(raw)])
    .map((line) => String(line || "").trim())
    .filter(Boolean)
  if (lines.length <= maxLines) return lines.length > 0 ? lines : ["-"]
  const clamped = lines.slice(0, maxLines)
  const lastIndex = maxLines - 1
  const last = clamped[lastIndex].trimEnd()
  if (!last) {
    clamped[lastIndex] = "…"
    return clamped
  }
  clamped[lastIndex] = `${last.slice(0, Math.max(1, last.length - 1)).trimEnd()}…`
  return clamped
}

function drawRevisionContextBlock(pdf: jsPDF, startY: number, context: RevisionSheetContext): number {
  const cols = [
    { label: "Client", value: context.client },
    { label: "Locație", value: context.location },
    { label: "Echipament", value: context.equipment },
  ]
  const colW = CONTENT_WIDTH / 3
  const padX = 2
  const labelTop = 3.8
  const valueTop = 8.1
  const lineHeight = 3.7
  const maxLinesPerCell = 3

  const linesByCol = cols.map((c) => splitTextToSizeClamped(pdf, c.value, colW - padX * 2, maxLinesPerCell))
  const maxLines = Math.max(1, ...linesByCol.map((lines) => lines.length))
  const blockHeight = Math.max(14, valueTop + maxLines * lineHeight + 2.2)

  pdf.setDrawColor(210, 210, 210).setLineWidth(0.25)
  pdf.rect(MARGIN, startY, CONTENT_WIDTH, blockHeight)
  pdf.line(MARGIN + colW, startY, MARGIN + colW, startY + blockHeight)
  pdf.line(MARGIN + colW * 2, startY, MARGIN + colW * 2, startY + blockHeight)

  for (let idx = 0; idx < cols.length; idx++) {
    const x = MARGIN + idx * colW + padX
    try { pdf.setFont("NotoSans", "bold") } catch {}
    pdf.setFontSize(8).setTextColor(75, 85, 99)
    pdf.text(normalizeTextForPdf(cols[idx].label), x, startY + labelTop)

    try { pdf.setFont("NotoSans", "normal") } catch {}
    pdf.setFontSize(9).setTextColor(0, 0, 0)
    pdf.text(linesByCol[idx], x, startY + valueTop)
  }

  return startY + blockHeight + 4
}

function getChecklistLayout(): ChecklistLayout {
  const totalW = CONTENT_WIDTH
  const firstColW = Math.round(totalW * 0.62)
  const verW = 22
  const obsW = totalW - firstColW - verW
  return {
    rowH: 8,
    totalW,
    firstColW,
    verW,
    obsW,
  }
}

function drawChecklistTableHeader(pdf: jsPDF, startY: number, layout: ChecklistLayout): number {
  pdf.setFillColor(220, 227, 240)
  pdf.rect(MARGIN, startY, layout.totalW, layout.rowH, "F")
  try { pdf.setFont("NotoSans", "bold") } catch {}
  pdf.setFontSize(10).setTextColor(0, 0, 0)
  pdf.text(normalizeTextForPdf("Puncte de control"), MARGIN + 2, startY + 5)
  pdf.text(normalizeTextForPdf("Verificat"), MARGIN + layout.firstColW + layout.verW / 2, startY + 5, { align: "center" } as any)
  pdf.text(normalizeTextForPdf("Obs."), MARGIN + layout.firstColW + layout.verW + 2, startY + 5)
  return startY + layout.rowH
}

function measureChecklistItemHeight(pdf: jsPDF, it: any, layout: ChecklistLayout): number {
  const label = normalizeTextForPdf(it.label || it.name || "-")
  const obs = normalizeTextForPdf(it.obs || "")
  const labelLines = pdf.splitTextToSize(label, layout.firstColW - 4)
  const obsLines = obs ? pdf.splitTextToSize(obs, layout.obsW - 4) : []
  const numLines = Math.max(labelLines.length, obsLines.length || 0)
  const lineHeight = 4
  const baseRow = 8
  const dynamic = numLines > 1 ? 5 + (numLines - 1) * lineHeight : baseRow
  return Math.max(baseRow, dynamic)
}

async function loadLogoDataUrl(): Promise<string | null> {
  try {
    const resp = await fetch("/nrglogo.png")
    const blob = await resp.blob()
    return await new Promise((resolve) => {
      const fr = new FileReader()
      fr.onload = () => resolve(fr.result as string)
      fr.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

export async function generateRevisionOperationsPDF(lucrareId: string): Promise<Blob> {
  const doc = new jsPDF({ unit: "mm", format: "a4" })
  let currentY = MARGIN
  await ensurePdfFont(doc)
  try { doc.setFont("NotoSans", "normal") } catch {}

  // Load lucrare (for client/location context if needed later)
  const workSnap = await getDoc(docRef("lucrari", lucrareId))
  const work = workSnap.exists() ? (workSnap.data() as any) : null

  // Load revisions
  const revCol = collection(db, "lucrari", lucrareId, "revisions")
  const revSnap = await getDocs(revCol)
  const revisions: RevisionDoc[] = revSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))

  const logoDataUrl = await loadLogoDataUrl()
  const layout = getChecklistLayout()
  const workNumberBase = buildWorkNumberBase(work, lucrareId)

  for (let idx = 0; idx < revisions.length; idx++) {
    const rev = revisions[idx]

    // Header: Lista operațiuni – {Nivel 2} (categorie sau primul puncte de control când nu există categorii)
    const sectionsForHeader = Array.isArray(rev.sections) ? rev.sections : []
    const level2Label = resolveHeaderLabel(rev, sectionsForHeader)
    const sheetNumberLabel = `${workNumberBase} - ${idx + 1}`
    const headerTitle = buildEquipmentSheetHeaderTitle(level2Label, sheetNumberLabel)
    const context = resolveRevisionContext(work, rev, rev?.equipmentId || rev?.id)

    const drawPageStart = () => {
      currentY = drawSimpleHeader(doc, { title: headerTitle, logoDataUrl })
      currentY = drawRevisionContextBlock(doc, currentY, context)
      currentY = drawChecklistTableHeader(doc, currentY, layout)
    }
    drawPageStart()

    // Page-break helper cu header repetat si footer centrat
    const checkBreak = (need: number) => {
      const PH = doc.internal.pageSize.getHeight()
      if (currentY + need > PH - MARGIN - 30) {
        drawFooter(doc)
        doc.addPage()
        drawPageStart()
        // Reset text state after header so we don't inherit footer/header styles
        try { doc.setFont("NotoSans", "normal") } catch {}
        doc.setFontSize(9).setTextColor(0, 0, 0)
      }
    }

    const sections = Array.isArray(rev.sections) ? rev.sections : []

    for (const s of sections) {
      const sectionTitle = normalizeTextForPdf(s.title || s.name || "Secțiune")
      const items = Array.isArray(s.items) ? s.items : []

      // Înălțimea totală a secțiunii (header + toate item-urile)
      const sectionHeight = layout.rowH + items.reduce((sum: number, it: any) => sum + measureChecklistItemHeight(doc, it, layout), 0)
      // Dacă nu încape întreaga secțiune pe pagină, mutăm pe pagina următoare
      checkBreak(sectionHeight)

      // Section row (category)
      doc.setFillColor(240, 240, 240)
      doc.rect(MARGIN, currentY, layout.totalW, layout.rowH, "F")
      try { doc.setFont("NotoSans", "bold") } catch {}
      doc.setFontSize(10).setTextColor(0, 0, 0)
      doc.text(sectionTitle, MARGIN + 2, currentY + 5)
      currentY += layout.rowH

      // Items
      try { doc.setFont("NotoSans", "normal") } catch {}
      doc.setFontSize(9).setTextColor(0, 0, 0)
      for (const it of items) {
        const label = normalizeTextForPdf(it.label || it.name || "-")
        const rawState = it.state as any
        const state =
          rawState === true
            ? "functional"
            : rawState === false
              ? "nefunctional"
              : (rawState || "na") as "functional" | "nefunctional" | "na"
        const obs = normalizeTextForPdf(it.obs || "")

        const labelLines = doc.splitTextToSize(label, layout.firstColW - 4)
        const obsLines = obs ? doc.splitTextToSize(obs, layout.obsW - 4) : []
        const numLines = Math.max(labelLines.length, obsLines.length || 0)
        const lineHeight = 4 // aproximativ pentru fontSize 9
        const baseRow = 8
        const dynamic = numLines > 1 ? 5 + (numLines - 1) * lineHeight : baseRow
        const heightNeeded = Math.max(baseRow, dynamic)

        checkBreak(heightNeeded)
        try { doc.setFont("NotoSans", "normal") } catch {}
        doc.setFontSize(9).setTextColor(0, 0, 0)

        doc.setDrawColor(210, 210, 210).setLineWidth(0.2)
        doc.rect(MARGIN, currentY, layout.totalW, heightNeeded)

        doc.text(labelLines, MARGIN + 2, currentY + 5)

        const verX = MARGIN + layout.firstColW
        try { doc.setFont("NotoSans", "bold") } catch {}
        const isFunctional = state === "functional"
        const isNonFunctional = state === "nefunctional"
        const cx = verX + layout.verW / 2
        const cy = currentY + 5
        if (isFunctional) {
          doc.setDrawColor(22, 163, 74).setLineWidth(0.6)
          doc.line(cx - 3, cy - 1, cx - 1, cy + 2)
          doc.line(cx - 1, cy + 2, cx + 3, cy - 3)
        } else if (isNonFunctional) {
          doc.setDrawColor(220, 38, 38).setLineWidth(0.6)
          doc.line(cx - 3, cy - 3, cx + 3, cy + 3)
          doc.line(cx - 3, cy + 3, cx + 3, cy - 3)
        }
        doc.setTextColor(0, 0, 0)

        try { doc.setFont("NotoSans", "normal") } catch {}
        if (obsLines.length) {
          doc.text(obsLines, MARGIN + layout.firstColW + layout.verW + 2, currentY + 5)
        }

        currentY += heightNeeded
      }
    }

    // Footer per page
    drawFooter(doc)
    if (idx < revisions.length - 1) {
      doc.addPage()
      currentY = MARGIN
    }
  }

  return doc.output("blob")
}

function docRef(collectionName: string, id: string) {
  return doc(db, collectionName, id)
}

/**
 * Generate a single‑equipment PDF sheet for a given lucrare and equipmentId.
 */
export async function generateRevisionEquipmentPDF(
  lucrareId: string,
  equipmentId: string,
  opts?: { headerLabelOverride?: string; sheetNumberLabel?: string }
): Promise<Blob> {
  const js = new jsPDF({ unit: "mm", format: "a4" })
  let currentY = MARGIN
  await ensurePdfFont(js)
  try { js.setFont("NotoSans", "normal") } catch {}
  const layout = getChecklistLayout()
  const workSnap = await getDoc(docRef("lucrari", lucrareId))
  const work = workSnap.exists() ? (workSnap.data() as any) : null

  // Load single revision
  const revSnap = await getDoc(doc(db, "lucrari", lucrareId, "revisions", equipmentId))
  if (!revSnap.exists()) {
    // Return an empty PDF with a note
    const emptyLogo = await loadLogoDataUrl()
    const missingHeaderTitle = buildEquipmentSheetHeaderTitle(
      "Nivel 2 — Fie categorii, fie variabile",
      opts?.sheetNumberLabel
    )
    const context = resolveRevisionContext(work, null, equipmentId)
    currentY = drawSimpleHeader(js, { title: missingHeaderTitle, logoDataUrl: emptyLogo })
    currentY = drawRevisionContextBlock(js, currentY, context)
    try { js.setFont("NotoSans", "normal") } catch {}
    js.setFontSize(10)
    js.text(normalizeTextForPdf("Fișa de operațiuni nu a fost găsită pentru acest echipament."), MARGIN + 2, currentY + 4)
    drawFooter(js)
    return js.output("blob")
  }
  const rev = { id: revSnap.id, ...(revSnap.data() as any) } as any

  // Header: Lista operațiuni – {Nivel 2} (categorie sau primul puncte de control când nu există categorii)
  const sectionsForHeader = Array.isArray(rev.sections) ? rev.sections : []
  const level2Label = resolveHeaderLabel(
    { ...rev, headerOverride: opts?.headerLabelOverride },
    sectionsForHeader
  )
  const title = buildEquipmentSheetHeaderTitle(level2Label, opts?.sheetNumberLabel)
  const logoDataUrl = await loadLogoDataUrl()
  const context = resolveRevisionContext(work, rev, equipmentId)

  const drawPageStart = () => {
    currentY = drawSimpleHeader(js, { title, logoDataUrl })
    currentY = drawRevisionContextBlock(js, currentY, context)
    currentY = drawChecklistTableHeader(js, currentY, layout)
  }
  drawPageStart()

  const checkBreak = (need: number) => {
    const PH = js.internal.pageSize.getHeight()
    if (currentY + need > PH - MARGIN - 30) {
      drawFooter(js)
      js.addPage()
      drawPageStart()
      // Reset text state after header so we don't inherit footer/header styles
      try { js.setFont("NotoSans", "normal") } catch {}
      js.setFontSize(9).setTextColor(0, 0, 0)
    }
  }

  const sections = Array.isArray(rev.sections) ? rev.sections : []

  for (const s of sections) {
    const sectionTitle = normalizeTextForPdf(s.title || s.name || "Secțiune")
    const items = Array.isArray(s.items) ? s.items : []

    // Înălțimea totală a secțiunii (header + toate item-urile)
    const sectionHeight = layout.rowH + items.reduce((sum: number, it: any) => sum + measureChecklistItemHeight(js, it, layout), 0)
    // Dacă nu încape întreaga secțiune pe pagină, mutăm pe pagina următoare
    checkBreak(sectionHeight)

    js.setFillColor(240, 240, 240)
    js.rect(MARGIN, currentY, layout.totalW, layout.rowH, "F")
    try { js.setFont("NotoSans", "bold") } catch {}
    js.setFontSize(10).setTextColor(0, 0, 0)
    js.text(sectionTitle, MARGIN + 2, currentY + 5)
    currentY += layout.rowH

    try { js.setFont("NotoSans", "normal") } catch {}
    js.setFontSize(9).setTextColor(0, 0, 0)
    for (const it of items) {
      const label = normalizeTextForPdf(it.label || it.name || "-")
      const rawState = it.state as any
      const state =
        rawState === true
          ? "functional"
          : rawState === false
            ? "nefunctional"
            : (rawState || "na") as "functional" | "nefunctional" | "na"
      const obs = normalizeTextForPdf(it.obs || "")

      const labelLines = js.splitTextToSize(label, layout.firstColW - 4)
      const obsLines = obs ? js.splitTextToSize(obs, layout.obsW - 4) : []
      const numLines = Math.max(labelLines.length, obsLines.length || 0)
      const lineHeight = 4
      const baseRow = 8
      const dynamic = numLines > 1 ? 5 + (numLines - 1) * lineHeight : baseRow
      const heightNeeded = Math.max(baseRow, dynamic)
      checkBreak(heightNeeded)
      try { js.setFont("NotoSans", "normal") } catch {}
      js.setFontSize(9).setTextColor(0, 0, 0)

      js.setDrawColor(210, 210, 210).setLineWidth(0.2)
      js.rect(MARGIN, currentY, layout.totalW, heightNeeded)

      js.text(labelLines, MARGIN + 2, currentY + 5)

      const verX = MARGIN + layout.firstColW
      try { js.setFont("NotoSans", "bold") } catch {}
      const isFunctional = state === "functional"
      const isNonFunctional = state === "nefunctional"
      const cx = verX + layout.verW / 2
      const cy = currentY + 5
      if (isFunctional) {
        js.setDrawColor(22, 163, 74).setLineWidth(0.6)
        js.line(cx - 3, cy - 1, cx - 1, cy + 2)
        js.line(cx - 1, cy + 2, cx + 3, cy - 3)
      } else if (isNonFunctional) {
        js.setDrawColor(220, 38, 38).setLineWidth(0.6)
        js.line(cx - 3, cy - 3, cx + 3, cy + 3)
        js.line(cx - 3, cy + 3, cx + 3, cy - 3)
      }
      js.setTextColor(0, 0, 0)

      try { js.setFont("NotoSans", "normal") } catch {}
      if (obsLines.length) {
        js.text(obsLines, MARGIN + layout.firstColW + layout.verW + 2, currentY + 5)
      }

      currentY += heightNeeded
    }
  }

  drawFooter(js)
  return js.output("blob")
}
