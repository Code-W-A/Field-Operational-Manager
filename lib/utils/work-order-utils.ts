/**
 * Formats a work order ID into a standardized code format
 * @param workOrderId The work order ID or number
 * @returns Formatted work order code
 */
export function formatWorkOrderCode(workOrderId: string | number): string {
  if (!workOrderId) return ""

  // If it's already in the format we want, return it
  if (typeof workOrderId === "string" && workOrderId.startsWith("WO-")) {
    return workOrderId
  }

  // If it's a number or numeric string, format it with leading zeros
  const numericId = typeof workOrderId === "string" ? Number.parseInt(workOrderId, 10) : workOrderId

  if (!isNaN(numericId)) {
    return `WO-${numericId.toString().padStart(6, "0")}`
  }

  // If it's a non-numeric string (like a Firebase ID), use it directly
  return `WO-${workOrderId}`
}
