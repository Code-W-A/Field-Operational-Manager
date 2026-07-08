import type { HrRequest } from "@/lib/hr/types"

const DOCX_TEMPLATE_FILE_BY_KIND: Partial<Record<HrRequest["kind"], string>> = {
  CO: "Cerere concediu de odihna.docx",
  CFP: "Cerere concediu fara plata.docx",
  DEL: "delegatie.docx",
}

export function getHrRequestDocxTemplateFile(kind: HrRequest["kind"]): string | null {
  return DOCX_TEMPLATE_FILE_BY_KIND[kind] ?? null
}

export function canGenerateHrRequestDocx(kind: HrRequest["kind"]): boolean {
  return Boolean(getHrRequestDocxTemplateFile(kind))
}
