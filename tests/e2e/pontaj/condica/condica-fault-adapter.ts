/**
 * Test-only commit boundary for Condica. It is deliberately not imported by
 * application code, so production builds cannot expose a browser-controlled
 * failure switch.
 */
export const TEST_ONLY_CONDICA_ADAPTER_MARKER = "PONTAJ_TEST_ONLY_CONDICA_ADAPTER"

export async function commitCondicaMutationForTest(params: {
  failBeforeCommit?: boolean
  /** The production mutation has one Firestore commit; values above 1 are invalid. */
  failAtOperation?: number
  commit: () => Promise<void>
}) {
  if (params.failBeforeCommit || params.failAtOperation === 1) {
    throw new Error("Injected Condica atomic commit failure")
  }
  if (params.failAtOperation && params.failAtOperation > 1) {
    throw new Error("Condica mutation has exactly one atomic Firestore operation")
  }
  await params.commit()
}

/**
 * Models the two real commits in approved-request editing: the HR request is
 * written first, then its derived timesheet cells are synchronized. This stays
 * in test code so the browser bundle has no failure switch.
 */
export async function updateAndSyncCondicaRequestForTest(params: {
  updateRequest: () => Promise<void>
  syncTimesheet: () => Promise<void>
  failBeforeSync?: boolean
}) {
  await params.updateRequest()
  if (params.failBeforeSync) {
    throw new Error("Injected Condica request resync failure")
  }
  await params.syncTimesheet()
}
