export interface CheckoutPipelineResult<TCommit, TSync> {
  committed: TCommit
  syncResult: TSync | null
  syncError: unknown | null
  auditError: unknown | null
}

interface CheckoutPipelineDependencies<TCommit, TSync> {
  commit: () => Promise<TCommit>
  sync: (committed: TCommit) => Promise<TSync>
  audit: (committed: TCommit) => void | Promise<void>
  onSyncError?: (error: unknown, committed: TCommit) => void | Promise<void>
  onAuditError?: (error: unknown, committed: TCommit) => void | Promise<void>
}

/**
 * Defines the checkout durability boundary: post-commit effects may fail, but
 * they can never roll back the already completed attendance transaction.
 */
export async function executeCheckoutPipeline<TCommit, TSync>(
  dependencies: CheckoutPipelineDependencies<TCommit, TSync>,
): Promise<CheckoutPipelineResult<TCommit, TSync>> {
  const committed = await dependencies.commit()

  let auditError: unknown | null = null
  try {
    await dependencies.audit(committed)
  } catch (error) {
    auditError = error
    await dependencies.onAuditError?.(error, committed)
  }

  let syncResult: TSync | null = null
  let syncError: unknown | null = null
  try {
    syncResult = await dependencies.sync(committed)
  } catch (error) {
    syncError = error
    await dependencies.onSyncError?.(error, committed)
  }

  return { committed, syncResult, syncError, auditError }
}

/** The confirmation callback is the first UI work allowed after checkout resolves. */
export async function executeCheckoutWithConfirmation<T>(
  checkout: () => Promise<T>,
  confirm: (result: T) => void | Promise<void>,
): Promise<T> {
  const result = await checkout()
  await confirm(result)
  return result
}
