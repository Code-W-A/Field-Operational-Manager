export const TEST_ONLY_CHECKOUT_ADAPTER_MARKER = "PONTAJ_TEST_ONLY_CHECKOUT_ADAPTER"

export function failTimesheetWrite(): never {
  throw new Error("Injected hrTimesheets write failure")
}

export function failAuditWrite(): never {
  throw new Error("Injected audit log failure")
}

export function createPreConfirmationObserver(assertCommitted: () => void | Promise<void>) {
  let confirmed = false
  return {
    confirm: async () => {
      if (confirmed) throw new Error("Confirmation callback invoked more than once")
      await assertCommitted()
      if (confirmed) throw new Error("Confirmation became visible before the callback boundary")
      confirmed = true
    },
    isConfirmed: () => confirmed,
  }
}
