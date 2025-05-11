/**
 * Utility function to handle navigation when there are unsaved changes
 * @param hasUnsavedChanges Boolean indicating if there are unsaved changes
 * @param setShowDialog Function to set the state of the confirmation dialog
 * @param navigateAction Function to execute if navigation is confirmed or there are no unsaved changes
 */
export const handleNavigation = (
  hasUnsavedChanges: boolean,
  setShowDialog: (show: boolean) => void,
  navigateAction: () => void,
) => {
  if (hasUnsavedChanges) {
    // If there are unsaved changes, show the confirmation dialog
    setShowDialog(true)
  } else {
    // If there are no unsaved changes, execute the navigation action directly
    navigateAction()
  }
}
