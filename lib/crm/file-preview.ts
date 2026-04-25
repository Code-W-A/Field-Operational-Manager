import type { CrmFileAttachment } from "@/lib/crm/types"

const CRM_DOWNLOAD_ONLY_MIME_TYPES = new Set([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
])

const DOWNLOAD_ONLY_EXTENSIONS = new Set([".doc", ".docx", ".xls", ".xlsx"])

function extensionOfFilename(filename: string) {
  const n = String(filename || "").trim().toLowerCase()
  if (!n.includes(".")) return ""
  const last = n.lastIndexOf(".")
  return last >= 0 ? n.slice(last) : ""
}

export function isCrmFileDownloadOnly(mime: string, filename?: string) {
  if (mime && CRM_DOWNLOAD_ONLY_MIME_TYPES.has(mime)) return true
  const ext = extensionOfFilename(filename || "")
  return ext ? DOWNLOAD_ONLY_EXTENSIONS.has(ext) : false
}

/** Relative API path; same-origin, session cookie is sent. */
export function getCrmFileDownloadPath(fileId: string) {
  const id = String(fileId || "").trim()
  if (!id) return ""
  return `/api/crm/files/${encodeURIComponent(id)}/download`
}

export function canPreviewInBrowser(mime: string) {
  if (!mime) return false
  return (
    mime.startsWith("image/") ||
    mime === "application/pdf" ||
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/xml"
  )
}

export function getCrmFileOpenUrl(
  file: Pick<CrmFileAttachment, "url" | "mime"> & { filename?: string }
) {
  if (!file.url) return ""
  if (isCrmFileDownloadOnly(file.mime, file.filename)) return ""
  if (canPreviewInBrowser(file.mime)) return file.url
  return file.url
}
