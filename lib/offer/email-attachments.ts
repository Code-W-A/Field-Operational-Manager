export const MAX_OFFER_ATTACHMENTS = 10
export const MAX_OFFER_FILE_BYTES = 10_000_000
export const MAX_OFFER_EMAIL_BYTES = 15_000_000
export const OFFER_ATTACHMENT_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.gif,.tif,.tiff,.bmp,.doc,.docx,.xls,.xlsx,.dwg,.dxf,.zip"
export type OfferAttachmentContext = { kind: "crm" | "ticket"; id: string }
export type OfferEmailAttachment = { id: string; filename: string; size: number; contentType: string }
export class OfferAttachmentError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}
const mimeByExtension: Record<string, string> = {
  pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  gif: "image/gif", tif: "image/tiff", tiff: "image/tiff", bmp: "image/bmp", doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  dwg: "application/acad", dxf: "application/dxf", zip: "application/zip",
}
export function validateOfferFile(filename: unknown, size: unknown) {
  if (typeof filename !== "string" || !filename.trim() || filename.length > 200 || /[\x00-\x1f\x7f/\\]/.test(filename)) {
    throw new OfferAttachmentError("Numele fișierului este invalid (maximum 200 de caractere).")
  }
  const extension = filename.includes(".") ? filename.split(".").pop()!.toLowerCase() : ""
  const contentType = Object.prototype.hasOwnProperty.call(mimeByExtension, extension) ? mimeByExtension[extension] : undefined
  if (!contentType) throw new OfferAttachmentError(`${filename}: format neacceptat. Folosiți PDF, imagini, Word, Excel, DWG, DXF sau ZIP.`)
  if (typeof size !== "number" || !Number.isSafeInteger(size) || size <= 0 || size > MAX_OFFER_FILE_BYTES) {
    throw new OfferAttachmentError(`${filename}: fișierul trebuie să aibă între 1 octet și 10 MB.`)
  }
  return { filename, size, contentType }
}
export function parseOfferAttachments(value: unknown): OfferEmailAttachment[] {
  if (value == null) return []
  if (!Array.isArray(value) || value.length > MAX_OFFER_ATTACHMENTS) throw new OfferAttachmentError("Puteți atașa maximum 10 fișiere.")
  const seen = new Set<string>()
  const result = value.map((item) => {
    if (!item || typeof item.id !== "string" || !/^[a-zA-Z0-9_-]{8,80}$/.test(item.id) || seen.has(item.id)) throw new OfferAttachmentError("Lista atașamentelor este invalidă.")
    seen.add(item.id)
    return { id: item.id, ...validateOfferFile(item.filename, item.size) }
  })
  validateOfferEmailSize(result)
  return result
}
export function validateOfferEmailSize(files: Pick<OfferEmailAttachment, "size">[], pdfSize = 0) {
  if (!Number.isSafeInteger(pdfSize) || pdfSize < 0 || files.reduce((sum, file) => sum + file.size, pdfSize) > MAX_OFFER_EMAIL_BYTES) {
    throw new OfferAttachmentError("Atașamentele împreună cu PDF-ul ofertei depășesc 15 MB. Eliminați un fișier sau reduceți dimensiunea lui.")
  }
}
