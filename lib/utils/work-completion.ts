/** Installation completion uses its signed handover document, not an intervention report. */
export function hasTicketCompletionDocument(work: {
  raportGenerat?: boolean;
  installation?: { schemaVersion?: number; closedReason?: string; completionDocumentId?: string };
}) {
  return work.installation?.schemaVersion === 1
    ? work.installation.closedReason === "completed" && Boolean(work.installation.completionDocumentId)
    : work.raportGenerat === true;
}
