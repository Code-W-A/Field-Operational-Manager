import { formatBucharestFileStamp } from "@/lib/reports/date-range"

/** Basename (fără extensie) pentru exportul „Tichete nefacturate”. */
export function uninvoicedExportBasename(generatedAt: Date | string) {
  return `tichete-nefacturate_${formatBucharestFileStamp(generatedAt)}`
}
