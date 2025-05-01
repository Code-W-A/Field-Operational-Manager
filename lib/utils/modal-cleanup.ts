/**
 * Utility to ensure proper cleanup after modal/dialog/popover closing
 * This helps prevent the common issue where interactions are blocked
 * after a modal is closed
 */
export function ensureModalCleanup() {
  // Restore body scroll
  document.body.style.overflow = ""

  // Ensure pointer events work
  document.body.style.pointerEvents = ""

  // Remove modal classes
  document.documentElement.classList.remove("modal-open")

  // Force a reflow to ensure all event listeners are properly cleaned up
  window.setTimeout(() => {
    const forceReflow = document.body.offsetHeight
  }, 10)
}

/**
 * Global event handler to ensure modals are cleaned up properly
 * This can be attached to the main layout component
 */
export function setupGlobalModalCleanup() {
  if (typeof window !== "undefined") {
    // Listen for escape key to ensure cleanup
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        ensureModalCleanup()
      }
    })

    // Listen for clicks on the document to detect outside clicks
    window.addEventListener("click", (e) => {
      // Check if we clicked outside any modal/dialog
      const isOutsideClick =
        !e.target ||
        (!(e.target as HTMLElement).closest('[role="dialog"]') &&
          !(e.target as HTMLElement).closest('[role="menu"]') &&
          !(e.target as HTMLElement).closest("[data-radix-popper-content-wrapper]"))

      if (isOutsideClick) {
        ensureModalCleanup()
      }
    })
  }
}
