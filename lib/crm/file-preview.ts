import type { CrmFileAttachment } from "@/lib/crm/types"

const OFFICE_PREVIEW_MIME_TYPES = new Set([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
])

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

export function getCrmFileOpenUrl(file: Pick<CrmFileAttachment, "url" | "mime">) {
  if (!file.url) return ""
  if (canPreviewInBrowser(file.mime)) return file.url
  if (OFFICE_PREVIEW_MIME_TYPES.has(file.mime)) {
    return `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(file.url)}`
  }
  return file.url
}
