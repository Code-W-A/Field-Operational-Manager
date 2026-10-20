/** Modern installations finish with a signed handover, ordinary tickets with a report. */
export type TicketCompletion = {
  raportGenerat?: unknown;
  installation?: {
    schemaVersion?: unknown;
    closedReason?: unknown;
    completionDocumentId?: unknown;
  };
};

export function hasTicketCompletionDocument(work: TicketCompletion) {
  return work.installation?.schemaVersion === 1
    ? work.installation.closedReason === "completed" &&
        Boolean(work.installation.completionDocumentId)
    : work.raportGenerat === true;
}
