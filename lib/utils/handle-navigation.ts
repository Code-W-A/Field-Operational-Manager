/**
 * Utility function to handle navigation with unsaved changes
 * @param hasUnsavedChanges Function that checks if there are unsaved changes
 * @param onConfirm Function to call when navigation is confirmed
 * @returns Object with methods to handle navigation
 */
export const handleNavigation = (hasUnsavedChanges: () => boolean, onConfirm: () => void) => {
  // Check if there are unsaved changes
  if (hasUnsavedChanges()) {
    // Show confirmation dialog
    return {
      shouldProceed: false,
      showConfirmation: true,
    }
  }

  // No unsaved changes, proceed with navigation
  onConfirm()
  return {
    shouldProceed: true,
    showConfirmation: false,
  }
}
